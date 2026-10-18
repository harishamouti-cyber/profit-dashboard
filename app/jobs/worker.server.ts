import type { Job } from "@prisma/client";
import db from "../db.server";
import { adminQuery } from "../lib/admin.server";
import { BULK_STATUS, ORDERS_UPDATED_SINCE } from "../lib/graphql/queries";
import { fromDbDate, localDate, toDbDate } from "../lib/tz";
import { enqueue } from "./queue.server";

const MAX_ATTEMPTS = 5;

async function adminFor(shopDomain: string) {
  const { unauthenticated } = await import("../shopify.server");
  return unauthenticated.admin(shopDomain);
}

function payloadOf(job: Job): Record<string, unknown> {
  if (job.payload && typeof job.payload === "object" && !Array.isArray(job.payload)) {
    return job.payload as Record<string, unknown>;
  }
  return {};
}

async function retzone(shopDomain: string, timezone: string) {
  const shop = await db.shop.findUnique({ where: { shopDomain } });
  if (!shop) return;
  const orders = await db.order.findMany({ where: { shopId: shop.id }, include: { refunds: true } });
  const dates = new Set<string>();
  for (const order of orders) {
    const next = localDate(order.processedAt, timezone);
    dates.add(fromDbDate(order.localDate));
    dates.add(next);
    if (fromDbDate(order.localDate) !== next) {
      await db.order.update({ where: { id: order.id }, data: { localDate: toDbDate(next) } });
    }
    for (const refund of order.refunds) {
      const refundDay = localDate(refund.processedAt, timezone);
      dates.add(fromDbDate(refund.localDate));
      dates.add(refundDay);
      if (fromDbDate(refund.localDate) !== refundDay) {
        await db.refund.update({ where: { id: refund.id }, data: { localDate: toDbDate(refundDay) } });
      }
    }
  }
  const { rebuildDays } = await import("../lib/profit/rollup.server");
  await rebuildDays(shop.id, [...dates]);
}

async function reconcileShop(shopDomain: string) {
  const shop = await db.shop.findUnique({ where: { shopDomain } });
  if (!shop || shop.uninstalledAt) return;
  const { admin } = await adminFor(shopDomain);
  const cursorJob = await db.syncJob.findFirst({
    where: { shopId: shop.id, kind: "INCREMENTAL" },
    orderBy: { createdAt: "desc" },
  });
  const since = cursorJob?.cursorUpdatedAt ?? new Date(Date.now() - 20 * 60 * 1000);
  let after: string | null = null;
  let highWater = since;
  type OrdersUpdatedPage = {
    orders: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: Array<{ id: string; updatedAt: string }>;
    };
  };
  do {
    const page: OrdersUpdatedPage = await adminQuery<OrdersUpdatedPage>(admin, ORDERS_UPDATED_SINCE, {
      q: `updated_at:>'${since.toISOString()}'`,
      after,
    });
    if (!page.orders?.nodes) break;
    for (const node of page.orders.nodes) {
      await enqueue({ shopDomain, type: "sync_order", payload: { orderGid: node.id } });
      const updated = new Date(node.updatedAt);
      if (updated > highWater) highWater = updated;
    }
    after = page.orders.pageInfo?.hasNextPage ? page.orders.pageInfo.endCursor : null;
  } while (after);

  await db.syncJob.create({
    data: {
      shopId: shop.id,
      kind: "INCREMENTAL",
      status: "COMPLETED",
      cursorUpdatedAt: highWater,
      startedAt: new Date(),
      finishedAt: new Date(),
    },
  });

  const running = await db.syncJob.findMany({
    where: { shopId: shop.id, status: "RUNNING", bulkOperationGid: { not: null } },
  });
  for (const syncJob of running) {
    if (!syncJob.bulkOperationGid) continue;
    const status = await adminQuery<{ node: { status: string } | null }>(admin, BULK_STATUS, {
      id: syncJob.bulkOperationGid,
    });
    if (status.node && (status.node.status === "COMPLETED" || status.node.status === "FAILED")) {
      const { handleBulkFinish } = await import("../lib/sync/bulk.server");
      await handleBulkFinish(admin, shopDomain, syncJob.bulkOperationGid);
    }
  }
}

async function dispatch(job: Job): Promise<void> {
  const payload = payloadOf(job);
  switch (job.type) {
    case "sync_order": {
      const { admin } = await adminFor(job.shopDomain);
      const { syncOrder } = await import("../lib/sync/order.server");
      await syncOrder(admin, job.shopDomain, String(payload.orderGid), payload.recalc === true);
      return;
    }
    case "delete_order": {
      const { deleteOrder } = await import("../lib/sync/order.server");
      await deleteOrder(job.shopDomain, String(payload.orderGid));
      return;
    }
    case "bulk_finish": {
      const { admin } = await adminFor(job.shopDomain);
      const { handleBulkFinish } = await import("../lib/sync/bulk.server");
      await handleBulkFinish(admin, job.shopDomain, String(payload.bulkOperationGid));
      return;
    }
    case "sync_inventory_item": {
      const { admin } = await adminFor(job.shopDomain);
      const { syncInventoryItem } = await import("../lib/sync/costs.server");
      await syncInventoryItem(admin, job.shopDomain, String(payload.inventoryItemGid));
      return;
    }
    case "sync_product": {
      const { admin } = await adminFor(job.shopDomain);
      const { syncProduct } = await import("../lib/sync/costs.server");
      await syncProduct(admin, job.shopDomain, String(payload.productGid));
      return;
    }
    case "shop_update":
    case "refresh_billing": {
      const { admin } = await adminFor(job.shopDomain);
      const { refreshPlan } = await import("../lib/sync/bootstrap.server");
      await refreshPlan(admin, job.shopDomain);
      return;
    }
    case "start_backfill": {
      const { admin } = await adminFor(job.shopDomain);
      const { startBulk } = await import("../lib/sync/bulk.server");
      await startBulk(admin, job.shopDomain, "ORDERS_BACKFILL");
      await startBulk(admin, job.shopDomain, "REFUNDS_BACKFILL");
      await startBulk(admin, job.shopDomain, "COSTS_BACKFILL");
      return;
    }
    case "refunds_page": {
      const { admin } = await adminFor(job.shopDomain);
      const { pageRefundedOrders } = await import("../lib/sync/bulk.server");
      await pageRefundedOrders(
        admin,
        job.shopDomain,
        String(payload.since),
        typeof payload.cursor === "string" ? payload.cursor : null,
      );
      return;
    }
    case "rebuild_days": {
      const shop = await db.shop.findUnique({ where: { shopDomain: job.shopDomain } });
      if (!shop) return;
      const dates = Array.isArray(payload.dates) ? payload.dates.filter((date) => typeof date === "string") : [];
      const { rebuildDays } = await import("../lib/profit/rollup.server");
      await rebuildDays(shop.id, dates);
      return;
    }
    case "recalc_costs": {
      const shop = await db.shop.findUnique({ where: { shopDomain: job.shopDomain } });
      if (!shop) return;
      const { recalculateHistory } = await import("../lib/sync/order.server");
      await recalculateHistory(shop.id);
      return;
    }
    case "recompute_shipping": {
      const shop = await db.shop.findUnique({ where: { shopDomain: job.shopDomain } });
      if (!shop) return;
      const { recomputeShipping } = await import("../lib/sync/order.server");
      await recomputeShipping(shop.id);
      return;
    }
    case "retzone": {
      await retzone(job.shopDomain, String(payload.timezone));
      return;
    }
    case "scopes_updated": {
      const scopes = Array.isArray(payload.scopes) ? payload.scopes.map(String) : [];
      if (!scopes.includes("read_all_orders")) return;
      await db.shop.updateMany({ where: { shopDomain: job.shopDomain }, data: { historyDays: 3650 } });
      await enqueue({ shopDomain: job.shopDomain, type: "start_backfill", payload: {} });
      return;
    }
    case "reconcile_all": {
      const shops = await db.shop.findMany({ where: { uninstalledAt: null }, select: { shopDomain: true } });
      for (const shop of shops) {
        await reconcileShop(shop.shopDomain);
      }
      return;
    }
    default:
      throw new Error(`Unknown job type ${job.type}`);
  }
}

export async function pollOnce(): Promise<void> {
  const job = await db.job.findFirst({
    where: { status: "PENDING", runAt: { lte: new Date() } },
    orderBy: { runAt: "asc" },
  });
  if (!job) return;
  const claimed = await db.job.updateMany({
    where: { id: job.id, status: "PENDING" },
    data: { status: "RUNNING", attempts: { increment: 1 } },
  });
  if (claimed.count === 0) return;
  try {
    await dispatch(job);
    await db.job.update({ where: { id: job.id }, data: { status: "SUCCEEDED", lastError: null } });
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 2000);
    const attempts = job.attempts + 1;
    await db.job.update({
      where: { id: job.id },
      data:
        attempts >= MAX_ATTEMPTS
          ? { status: "FAILED", lastError: message }
          : {
              status: "PENDING",
              lastError: message,
              runAt: new Date(Date.now() + attempts * 15_000),
            },
    });
  }
}

async function ensureReconcile() {
  const pending = await db.job.count({
    where: { type: "reconcile_all", status: { in: ["PENDING", "RUNNING"] } },
  });
  if (pending > 0) return;
  await enqueue({ shopDomain: "*", type: "reconcile_all", payload: {} });
}

export function startWorker(): void {
  if (process.env.VITEST || process.env.DISABLE_EMBEDDED_WORKER === "1") return;
  const globalState = globalThis as { __profitDashboardWorker?: boolean };
  if (globalState.__profitDashboardWorker) return;
  globalState.__profitDashboardWorker = true;
  setInterval(() => {
    void pollOnce().catch((error) => console.error("job poll failed", error));
  }, 2000);
  setInterval(() => {
    void ensureReconcile().catch((error) => console.error("reconcile schedule failed", error));
  }, 15 * 60 * 1000);
}
