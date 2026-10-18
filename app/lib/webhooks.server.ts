import { claimWebhook, enqueue, readOrderId, readResourceGid } from "../jobs/queue.server";
import { redactOrderNames, redactShop } from "./privacy/redact.server";
import db from "../db.server";

const TOPIC_ALIASES: Record<string, string> = {
  APP_UNINSTALLED: "app/uninstalled",
  APP_SCOPES_UPDATE: "app/scopes_update",
  ORDERS_CREATE: "orders/create",
  ORDERS_UPDATED: "orders/updated",
  ORDERS_CANCELLED: "orders/cancelled",
  ORDERS_DELETE: "orders/delete",
  REFUNDS_CREATE: "refunds/create",
  PRODUCTS_UPDATE: "products/update",
  INVENTORY_ITEMS_UPDATE: "inventory_items/update",
  APP_SUBSCRIPTIONS_UPDATE: "app_subscriptions/update",
  BULK_OPERATIONS_FINISH: "bulk_operations/finish",
  SHOP_UPDATE: "shop/update",
  CUSTOMERS_DATA_REQUEST: "customers/data_request",
  CUSTOMERS_REDACT: "customers/redact",
  SHOP_REDACT: "shop/redact",
};

export function normalizeTopic(topic: string): string {
  if (TOPIC_ALIASES[topic]) return TOPIC_ALIASES[topic];
  return topic.trim().toLowerCase();
}

export async function acceptWebhook(input: {
  webhookId: string;
  shop: string;
  topic: string;
  payload: Record<string, unknown>;
}): Promise<Response> {
  const topic = normalizeTopic(input.topic);
  const fresh = await claimWebhook(input.webhookId, input.shop, topic);
  if (!fresh) return new Response();

  if (topic === "app/uninstalled") {
    await db.session.deleteMany({ where: { shop: input.shop } });
    await db.shop.updateMany({
      where: { shopDomain: input.shop },
      data: { uninstalledAt: new Date(), plan: "NONE" },
    });
    return new Response();
  }

  if (topic === "app/scopes_update") {
    const current = Array.isArray(input.payload.current) ? input.payload.current.map(String) : [];
    await enqueue({ shopDomain: input.shop, type: "scopes_updated", payload: { scopes: current } });
    return new Response();
  }

  if (topic === "orders/create" || topic === "orders/updated" || topic === "orders/cancelled") {
    const orderGid = readResourceGid(input.payload);
    if (orderGid) await enqueue({ shopDomain: input.shop, type: "sync_order", payload: { orderGid } });
    return new Response();
  }

  if (topic === "orders/delete") {
    const orderGid = readResourceGid(input.payload);
    if (orderGid) await enqueue({ shopDomain: input.shop, type: "delete_order", payload: { orderGid } });
    return new Response();
  }

  if (topic === "refunds/create") {
    const orderGid = readOrderId(input.payload);
    if (orderGid) await enqueue({ shopDomain: input.shop, type: "sync_order", payload: { orderGid } });
    return new Response();
  }

  if (topic === "products/update") {
    const productGid = readResourceGid(input.payload);
    if (productGid) await enqueue({ shopDomain: input.shop, type: "sync_product", payload: { productGid } });
    return new Response();
  }

  if (topic === "inventory_items/update") {
    const inventoryItemGid = readResourceGid(input.payload);
    if (inventoryItemGid) {
      await enqueue({ shopDomain: input.shop, type: "sync_inventory_item", payload: { inventoryItemGid } });
    }
    return new Response();
  }

  if (topic === "app_subscriptions/update") {
    await enqueue({ shopDomain: input.shop, type: "refresh_billing", payload: {} });
    return new Response();
  }

  if (topic === "bulk_operations/finish") {
    const bulkOperationGid = readResourceGid(input.payload);
    if (bulkOperationGid) {
      await enqueue({ shopDomain: input.shop, type: "bulk_finish", payload: { bulkOperationGid } });
    }
    return new Response();
  }

  if (topic === "shop/update") {
    await enqueue({ shopDomain: input.shop, type: "shop_update", payload: {} });
    return new Response();
  }

  return handleCompliance(topic, input.shop, input.payload);
}

export async function handleCompliance(
  topic: string,
  shop: string,
  payload: Record<string, unknown>,
): Promise<Response> {
  const normalized = normalizeTopic(topic);
  if (normalized === "customers/data_request") {
    console.info(`data request ${shop}`);
    return new Response(null, { status: 200 });
  }
  if (normalized === "customers/redact") {
    const ids = Array.isArray(payload.orders_to_redact)
      ? payload.orders_to_redact.filter((id): id is number => typeof id === "number")
      : [];
    await redactOrderNames(db, shop, ids);
    return new Response(null, { status: 200 });
  }
  if (normalized === "shop/redact") {
    await redactShop(db, shop);
    return new Response(null, { status: 200 });
  }
  return new Response(null, { status: 200 });
}
