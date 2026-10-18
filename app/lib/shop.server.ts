import db from "../db.server";
import { enqueue } from "../jobs/queue.server";
import { authenticate } from "../shopify.server";
import { bootstrapShop, refreshPlan } from "./sync/bootstrap.server";

const FRESH_MS = 10 * 60 * 1000;

/**
 * Load the shop row for an authenticated admin request.
 * A missing row is bootstrapped from Shopify. If that call fails, a placeholder
 * row is saved so pages still render, and a background job retries the bootstrap.
 */
export async function loadShop(
  admin: { graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response> },
  shopDomain: string,
  sessionScope?: string | null,
) {
  let shop = await db.shop.findUnique({ where: { shopDomain } });
  if (!shop) {
    try {
      return await bootstrapShop(admin, shopDomain, sessionScope);
    } catch (error) {
      console.error(`bootstrap failed for ${shopDomain}`, error);
      shop = await db.shop.upsert({
        where: { shopDomain },
        create: { shopDomain, currencyCode: "USD", ianaTimezone: "UTC" },
        update: {},
      });
      await enqueue({ shopDomain, type: "refresh_billing", payload: {} });
      return shop;
    }
  }

  const age = shop.planSyncedAt ? Date.now() - shop.planSyncedAt.getTime() : Number.POSITIVE_INFINITY;
  if (age < FRESH_MS) return shop;
  try {
    return (await refreshPlan(admin, shopDomain)) ?? shop;
  } catch (error) {
    console.error(`plan refresh failed for ${shopDomain}`, error);
    return shop;
  }
}

export async function requireShop(request: Request) {
  const { admin, session, redirect } = await authenticate.admin(request);
  const shop = await loadShop(admin, session.shop, session.scope);
  return { admin, session, shop, redirect };
}

export async function requireFreshShop(request: Request) {
  return requireShop(request);
}
