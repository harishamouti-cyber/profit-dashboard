import readline from "node:readline";
import { Readable } from "node:stream";
import type { SyncKind } from "@prisma/client";
import db from "../../db.server";
import { adminQuery } from "../admin.server";
import type { AdminClient } from "../billing.server";
import {
  BULK_RUN,
  BULK_STATUS,
  REFUNDED_ORDERS_PAGE,
  ordersBulkInner,
  refundsBulkInner,
  variantsBulkInner,
} from "../graphql/queries";
import { enqueue } from "../../jobs/queue.server";
import { addDays, todayInZone } from "../tz";
import { assembleBulk, type JsonObject } from "./assemble.server";
import { upsertVariants, recordShopifyCost } from "./costs.server";
import { upsertOrderGraph } from "./order.server";
import { rebuildDays } from "../profit/rollup.server";

export async function streamJsonl(
  url: string,
  onObject: (object: JsonObject) => void | Promise<void>,
): Promise<number> {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`JSONL download failed (${response.status})`);
  }
  const nodeStream = Readable.fromWeb(response.body as import("node:stream/web").ReadableStream);
  const lines = readline.createInterface({ input: nodeStream, crlfDelay: Infinity });
  let count = 0;
  for await (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let object: JsonObject;
    try {
      object = JSON.parse(trimmed) as JsonObject;
    } catch {
      continue;
    }
    count += 1;
    await onObject(object);
  }
  return count;
}

async function runBulk(admin: AdminClient, query: string) {
  const data = await adminQuery<{
    bulkOperationRunQuery: {
      bulkOperation: { id: string; status: string } | null;
      userErrors: Array<{ message: string }>;
    };
  }>(admin, BULK_RUN, { q: query });
  return data.bulkOperationRunQuery;
}

export async function startBulk(
  admin: AdminClient,
  shopDomain: string,
  kind: Extract<SyncKind, "ORDERS_BACKFILL" | "REFUNDS_BACKFILL" | "COSTS_BACKFILL">,
): Promise<void> {
  const shop = await db.shop.findUnique({ where: { shopDomain } });
  if (!shop) return;
  const since = addDays(todayInZone(shop.ianaTimezone), -shop.historyDays);
  let query =
    kind === "ORDERS_BACKFILL"
      ? ordersBulkInner(since, true)
      : kind === "REFUNDS_BACKFILL"
        ? refundsBulkInner(since)
        : variantsBulkInner();
  let result = await runBulk(admin, query);
  let feesViaQ4 = false;

  if (kind === "ORDERS_BACKFILL" && result.userErrors.some((error) => /transaction/i.test(error.message))) {
    query = ordersBulkInner(since, false);
    result = await runBulk(admin, query);
    feesViaQ4 = true;
  }

  if (kind === "REFUNDS_BACKFILL" && result.userErrors.length > 0) {
    await db.syncJob.create({
      data: {
        shopId: shop.id,
        kind,
        status: "RUNNING",
        error: "FALLBACK_Q4",
        startedAt: new Date(),
      },
    });
    await enqueue({ shopDomain, type: "refunds_page", payload: { since, cursor: null } });
    return;
  }

  if (result.userErrors.length > 0 || !result.bulkOperation) {
    await db.syncJob.create({
      data: {
        shopId: shop.id,
        kind,
        status: "FAILED",
        error: result.userErrors.map((error) => error.message).join("; ") || "Bulk operation was not created",
        startedAt: new Date(),
        finishedAt: new Date(),
      },
    });
    return;
  }

  await db.syncJob.create({
    data: {
      shopId: shop.id,
      kind,
      status: "RUNNING",
      bulkOperationGid: result.bulkOperation.id,
      error: feesViaQ4 ? "FEES_VIA_Q4" : null,
      startedAt: new Date(),
    },
  });
}

export async function handleBulkFinish(admin: AdminClient, shopDomain: string, bulkOperationGid: string) {
  const shop = await db.shop.findUnique({ where: { shopDomain } });
  if (!shop) return;
  const syncJob = await db.syncJob.findFirst({
    where: { shopId: shop.id, bulkOperationGid },
    orderBy: { createdAt: "desc" },
  });
  const status = await adminQuery<{
    node: {
      id: string;
      status: string;
      errorCode: string | null;
      objectCount: string | number | null;
      url: string | null;
      partialDataUrl: string | null;
    } | null;
  }>(admin, BULK_STATUS, { id: bulkOperationGid });
  const operation = status.node;
  if (!operation) return;
  const url = operation.url ?? operation.partialDataUrl;
  // Shopify returns no url when a completed bulk query matched nothing (for example a new store
  // with no orders). That is a successful, empty sync, not a failure.
  if (!url && operation.status === "COMPLETED") {
    if (syncJob) {
      await db.syncJob.update({
        where: { id: syncJob.id },
        data: { status: "COMPLETED", objectCount: 0, error: null, finishedAt: new Date() },
      });
    }
    return;
  }
  if (!url || (operation.status === "FAILED" && !operation.partialDataUrl)) {
    if (syncJob) {
      await db.syncJob.update({
        where: { id: syncJob.id },
        data: {
          status: "FAILED",
          error: operation.errorCode ?? "Bulk operation failed",
          finishedAt: new Date(),
        },
      });
    }
    return;
  }

  const objects: JsonObject[] = [];
  const count = await streamJsonl(url, (object) => {
    objects.push(object);
  });
  const { orders, variants } = assembleBulk(objects);
  const dates = new Set<string>();
  if (variants.length > 0) {
    await upsertVariants(shop.id, variants);
    for (const variant of variants) {
      await recordShopifyCost(shop.id, variant.variantGid, variant.shopifyUnitCost, shop.ianaTimezone);
    }
  }
  const feesViaQ4 = syncJob?.error === "FEES_VIA_Q4";
  for (const order of orders) {
    const affected = await upsertOrderGraph(shop, order);
    for (const date of affected) dates.add(date);
    if (feesViaQ4) {
      await enqueue({ shopDomain, type: "sync_order", payload: { orderGid: order.orderGid } });
    }
  }
  await rebuildDays(shop.id, [...dates]);
  if (syncJob) {
    await db.syncJob.update({
      where: { id: syncJob.id },
      data: {
        status: operation.status === "COMPLETED" ? "COMPLETED" : "FAILED",
        objectCount: Number(operation.objectCount ?? count) || count,
        error: operation.errorCode,
        finishedAt: new Date(),
      },
    });
  }
}

export async function pageRefundedOrders(
  admin: AdminClient,
  shopDomain: string,
  since: string,
  cursor: string | null,
) {
  const data = await adminQuery<{
    orders: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: Array<{ id: string }> };
  }>(admin, REFUNDED_ORDERS_PAGE, {
    q: `processed_at:>=${since} AND (financial_status:partially_refunded OR financial_status:refunded)`,
    after: cursor,
  });
  if (!data.orders?.nodes) return;
  for (const node of data.orders.nodes) {
    await enqueue({ shopDomain, type: "sync_order", payload: { orderGid: node.id } });
  }
  if (data.orders.pageInfo.hasNextPage && data.orders.pageInfo.endCursor) {
    await enqueue({
      shopDomain,
      type: "refunds_page",
      payload: { since, cursor: data.orders.pageInfo.endCursor },
    });
  } else {
    const shop = await db.shop.findUnique({ where: { shopDomain } });
    if (!shop) return;
    await db.syncJob.updateMany({
      where: { shopId: shop.id, kind: "REFUNDS_BACKFILL", error: "FALLBACK_Q4", status: "RUNNING" },
      data: { status: "COMPLETED", error: null, finishedAt: new Date() },
    });
  }
}
