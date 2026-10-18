import { afterAll, describe, expect, it } from "vitest";
import db from "../../app/db.server";
import { redactShop } from "../../app/lib/privacy/redact.server";
import { handleCompliance } from "../../app/lib/webhooks.server";

const domain = `redact-${Date.now()}.myshopify.com`;

afterAll(async () => {
  await redactShop(db, domain);
  await db.$disconnect();
});

describe("shop/redact", () => {
  it("deletes every row owned by the shop and returns 200 for all three compliance topics", async () => {
    const shop = await db.shop.create({
      data: { shopDomain: domain, currencyCode: "USD", ianaTimezone: "UTC" },
    });
    const order = await db.order.create({
      data: {
        shopId: shop.id,
        orderGid: "gid://shopify/Order/1001",
        name: "#1001",
        processedAt: new Date("2026-06-01T00:00:00.000Z"),
        localDate: new Date("2026-06-01T00:00:00.000Z"),
        taxesIncluded: false,
        currencyCode: "USD",
        presentmentCurrency: "USD",
        grossLineSales: "10",
        lineDiscounts: "0",
        lineTax: "0",
        shippingCharged: "0",
        shippingTax: "0",
        totalTax: "0",
        totalPrice: "10",
        shopifyUpdatedAt: new Date("2026-06-01T00:00:00.000Z"),
        lines: {
          create: {
            lineItemGid: "gid://shopify/LineItem/1",
            title: "Tee",
            quantity: 1,
            originalTotal: "10",
            discountTotal: "0",
            taxTotal: "0",
            netSalesExTax: "10",
          },
        },
      },
    });
    await db.refund.create({
      data: {
        shopId: shop.id,
        orderId: order.id,
        refundGid: "gid://shopify/Refund/1",
        processedAt: new Date("2026-06-02T00:00:00.000Z"),
        localDate: new Date("2026-06-02T00:00:00.000Z"),
        totalRefunded: "1",
        lineSubtotal: "1",
        lineTax: "0",
        shippingSubtotal: "0",
        shippingTax: "0",
      },
    });
    await db.variant.create({
      data: {
        shopId: shop.id,
        variantGid: "gid://shopify/ProductVariant/1",
        productGid: "gid://shopify/Product/1",
        productTitle: "Tee",
      },
    });
    await db.variantCost.create({
      data: {
        shopId: shop.id,
        variantGid: "gid://shopify/ProductVariant/1",
        unitCost: "4",
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        source: "MANUAL",
      },
    });
    await db.gatewayFeeRule.create({
      data: { shopId: shop.id, gateway: "shopify_payments", percent: "0.0290", fixed: "0.30" },
    });
    await db.adSpend.create({
      data: {
        shopId: shop.id,
        date: new Date("2026-06-01T00:00:00.000Z"),
        channel: "meta",
        amount: "5",
        source: "MANUAL",
      },
    });
    await db.expense.create({
      data: {
        shopId: shop.id,
        name: "Apps",
        amount: "30",
        frequency: "MONTHLY",
        startDate: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
    await db.dailyMetric.create({
      data: { shopId: shop.id, date: new Date("2026-06-01T00:00:00.000Z") },
    });
    await db.productDailyMetric.create({
      data: {
        shopId: shop.id,
        date: new Date("2026-06-01T00:00:00.000Z"),
        productGid: "gid://shopify/Product/1",
      },
    });
    await db.subscription.create({
      data: { shopId: shop.id, plan: "STARTER", status: "ACTIVE" },
    });
    await db.syncJob.create({
      data: { shopId: shop.id, kind: "ORDERS_BACKFILL", status: "COMPLETED" },
    });
    await db.shippingCost.create({
      data: { shopId: shop.id, orderName: "#1001", amount: "4" },
    });
    await db.session.create({
      data: { id: `session-${domain}`, shop: domain, state: "state", accessToken: "token" },
    });
    await db.job.create({
      data: { shopDomain: domain, type: "rebuild_days", payload: {} },
    });
    await db.processedWebhook.create({
      data: { id: `webhook-${domain}`, shopDomain: domain, topic: "orders/create" },
    });

    const dataRequest = await handleCompliance("customers/data_request", domain, {});
    const customersRedact = await handleCompliance("customers/redact", domain, {
      orders_to_redact: [1001],
    });
    expect(dataRequest.status).toBe(200);
    expect(customersRedact.status).toBe(200);
    const renamed = await db.order.findUnique({ where: { id: order.id } });
    expect(renamed?.name).toBe("redacted");

    const shopRedact = await handleCompliance("shop/redact", domain, {});
    expect(shopRedact.status).toBe(200);

    expect(await db.shop.count({ where: { shopDomain: domain } })).toBe(0);
    expect(await db.order.count({ where: { shopId: shop.id } })).toBe(0);
    expect(await db.refund.count({ where: { shopId: shop.id } })).toBe(0);
    expect(await db.variant.count({ where: { shopId: shop.id } })).toBe(0);
    expect(await db.variantCost.count({ where: { shopId: shop.id } })).toBe(0);
    expect(await db.gatewayFeeRule.count({ where: { shopId: shop.id } })).toBe(0);
    expect(await db.adSpend.count({ where: { shopId: shop.id } })).toBe(0);
    expect(await db.expense.count({ where: { shopId: shop.id } })).toBe(0);
    expect(await db.dailyMetric.count({ where: { shopId: shop.id } })).toBe(0);
    expect(await db.productDailyMetric.count({ where: { shopId: shop.id } })).toBe(0);
    expect(await db.subscription.count({ where: { shopId: shop.id } })).toBe(0);
    expect(await db.syncJob.count({ where: { shopId: shop.id } })).toBe(0);
    expect(await db.shippingCost.count({ where: { shopId: shop.id } })).toBe(0);
    expect(await db.session.count({ where: { shop: domain } })).toBe(0);
    expect(await db.job.count({ where: { shopDomain: domain } })).toBe(0);
    expect(await db.processedWebhook.count({ where: { shopDomain: domain } })).toBe(0);
  });
});
