import type { Plan } from "@prisma/client";
import db from "../../db.server";
import { adminQuery } from "../admin.server";
import type { AdminClient } from "../billing.server";
import { SHOP_BOOTSTRAP } from "../graphql/queries";
import { planFromSubscriptionName } from "../plan.server";
import { enqueue } from "../../jobs/queue.server";

const ESTIMATE_RULES = [
  { gateway: "shopify_payments", percent: "0.0290", fixed: "0.3000" },
  { gateway: "paypal", percent: "0.0349", fixed: "0.4900" },
  { gateway: "stripe", percent: "0.0290", fixed: "0.3000" },
  { gateway: "gift_card", percent: "0.0000", fixed: "0.0000" },
];

interface BootstrapData {
  shop: { id: string; currencyCode: string; ianaTimezone: string; myshopifyDomain: string };
  currentAppInstallation: {
    accessScopes: Array<{ handle: string }>;
    activeSubscriptions: Array<{
      id: string;
      name: string;
      status: string;
      test: boolean;
      currentPeriodEnd: string | null;
    }>;
  };
}

export async function applySubscription(
  shopId: string,
  subscription: BootstrapData["currentAppInstallation"]["activeSubscriptions"][number] | undefined,
): Promise<Plan> {
  const plan = planFromSubscriptionName(subscription?.name);
  await db.shop.update({
    where: { id: shopId },
    data: { plan, planSyncedAt: new Date() },
  });
  if (!subscription) {
    await db.subscription.deleteMany({ where: { shopId } });
    return plan;
  }
  await db.subscription.upsert({
    where: { shopId },
    create: {
      shopId,
      subscriptionGid: subscription.id,
      plan,
      status: subscription.status,
      test: subscription.test,
      currentPeriodEnd: subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd) : null,
    },
    update: {
      subscriptionGid: subscription.id,
      plan,
      status: subscription.status,
      test: subscription.test,
      currentPeriodEnd: subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd) : null,
    },
  });
  return plan;
}

async function seedEstimateRules(shopId: string) {
  const count = await db.gatewayFeeRule.count({ where: { shopId } });
  if (count > 0) return;
  await db.gatewayFeeRule.createMany({
    data: ESTIMATE_RULES.map((rule) => ({
      shopId,
      gateway: rule.gateway,
      percent: rule.percent,
      fixed: rule.fixed,
    })),
  });
}

export async function bootstrapShop(admin: AdminClient, shopDomain: string, sessionScope?: string | null) {
  const data = await adminQuery<BootstrapData>(admin, SHOP_BOOTSTRAP);
  const handles = data.currentAppInstallation.accessScopes.map((scope) => scope.handle);
  const scopeText = sessionScope ?? handles.join(",");
  const historyDays = scopeText.includes("read_all_orders") ? 3650 : 60;
  const shop = await db.shop.upsert({
    where: { shopDomain },
    create: {
      shopDomain,
      shopGid: data.shop.id,
      currencyCode: data.shop.currencyCode,
      ianaTimezone: data.shop.ianaTimezone,
      historyDays,
      planSyncedAt: new Date(),
    },
    update: {
      shopGid: data.shop.id,
      currencyCode: data.shop.currencyCode,
      ianaTimezone: data.shop.ianaTimezone,
      historyDays,
      uninstalledAt: null,
    },
  });
  await applySubscription(shop.id, data.currentAppInstallation.activeSubscriptions[0]);
  await seedEstimateRules(shop.id);
  await enqueue({ shopDomain, type: "start_backfill", payload: {} });
  return shop;
}

export async function refreshPlan(admin: AdminClient, shopDomain: string) {
  const data = await adminQuery<BootstrapData>(admin, SHOP_BOOTSTRAP);
  const shop = await db.shop.findUnique({ where: { shopDomain } });
  if (!shop) return bootstrapShop(admin, shopDomain);
  const previousTz = shop.ianaTimezone;
  const previousCurrency = shop.currencyCode;
  await db.shop.update({
    where: { id: shop.id },
    data: {
      shopGid: data.shop.id,
      currencyCode: data.shop.currencyCode,
      ianaTimezone: data.shop.ianaTimezone,
    },
  });
  await applySubscription(shop.id, data.currentAppInstallation.activeSubscriptions[0]);
  if (previousTz !== data.shop.ianaTimezone) {
    await enqueue({ shopDomain, type: "retzone", payload: { timezone: data.shop.ianaTimezone } });
  }
  if (previousCurrency !== data.shop.currencyCode) {
    console.info(`shop currency changed for ${shopDomain}; historical order currency is kept on each order`);
  }
  return db.shop.findUnique({ where: { shopDomain } });
}

export async function refreshPlanIfStale(admin: AdminClient, shopDomain: string) {
  const shop = await db.shop.findUnique({ where: { shopDomain } });
  if (!shop) return bootstrapShop(admin, shopDomain);
  const age = shop.planSyncedAt ? Date.now() - shop.planSyncedAt.getTime() : Number.POSITIVE_INFINITY;
  if (age < 10 * 60 * 1000) return shop;
  return refreshPlan(admin, shopDomain);
}

export function estimateRuleNote(): string {
  return "Seeded gateway rates are editable estimates, not your processor's contract.";
}
