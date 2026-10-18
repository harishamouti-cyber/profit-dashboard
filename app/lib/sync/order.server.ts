import type { Shop } from "@prisma/client";
import db from "../../db.server";
import { adminQuery } from "../admin.server";
import type { AdminClient } from "../billing.server";
import { ORDER_FOR_PROFIT } from "../graphql/queries";
import { D, toDb } from "../money";
import { skuFallbackGid, unitCostAt, type CostRow } from "../profit/costs";
import { computeOrder, shippingCostFor, type CostResolver, type ProfitSettings } from "../profit/order";
import { computeRefund } from "../profit/refund";
import { rebuildDays } from "../profit/rollup.server";
import { fromDbDate, localDate, toDbDate } from "../tz";
import { orderFromGraphql, type JsonObject, type NormalizedOrder } from "./assemble.server";

async function loadSettings(shop: Shop, orderName: string): Promise<ProfitSettings> {
  const [rules, override] = await Promise.all([
    db.gatewayFeeRule.findMany({ where: { shopId: shop.id } }),
    db.shippingCost.findUnique({ where: { shopId_orderName: { shopId: shop.id, orderName } } }),
  ]);
  return {
    feeMode: shop.feeMode,
    gatewayRules: rules.map((rule) => ({
      gateway: rule.gateway,
      percent: D(rule.percent),
      fixed: D(rule.fixed),
    })),
    shippingCostMode: shop.shippingCostMode,
    shippingFlatCost: D(shop.shippingFlatCost),
    shippingPercent: D(shop.shippingPercent),
    manualShippingCost: override ? D(override.amount) : null,
  };
}

async function loadResolver(shop: Shop): Promise<CostResolver> {
  const [costs, variants] = await Promise.all([
    db.variantCost.findMany({ where: { shopId: shop.id } }),
    db.variant.findMany({ where: { shopId: shop.id } }),
  ]);
  const toRow = (row: (typeof costs)[number]): CostRow => ({
    variantGid: row.variantGid,
    unitCost: D(row.unitCost),
    effectiveFrom: fromDbDate(row.effectiveFrom),
    source: row.source,
  });
  const history = costs.filter((row) => !row.variantGid.startsWith("sku:")).map(toRow);
  const skuRows = costs.filter((row) => row.variantGid.startsWith("sku:")).map(toRow);
  const shopify = new Map(
    variants.map((variant) => [
      variant.variantGid,
      variant.shopifyUnitCost == null ? null : D(variant.shopifyUnitCost),
    ]),
  );
  const allowSku = shop.plan === "PRO";
  return (variantGid, date, sku) => {
    if (variantGid) {
      return unitCostAt(history, variantGid, date, shopify.get(variantGid) ?? null);
    }
    if (allowSku && sku) {
      return unitCostAt(skuRows, skuFallbackGid(sku), date, null);
    }
    return { unitCost: null, missing: true };
  };
}

export async function upsertOrderGraph(
  shop: Shop,
  dto: NormalizedOrder,
  options?: { recalcCosts?: boolean },
): Promise<string[]> {
  const settings = await loadSettings(shop, dto.name);
  const resolver = await loadResolver(shop);
  const saleDate = localDate(dto.processedAt, shop.ianaTimezone);
  const computed = computeOrder(
    {
      taxesIncluded: dto.taxesIncluded,
      localDate: saleDate,
      lines: dto.lines,
      shippingLines: dto.shippingLines,
      transactions: dto.transactions,
    },
    settings,
    resolver,
  );

  const existing = await db.order.findUnique({
    where: { shopId_orderGid: { shopId: shop.id, orderGid: dto.orderGid } },
    include: { lines: true },
  });
  const preserved = new Map(
    (existing?.lines ?? []).map((line) => [line.lineItemGid, line.unitCostUsed]),
  );
  if (!options?.recalcCosts && existing) {
    for (const line of computed.lines) {
      if (line.isGiftCard || !preserved.has(line.lineItemGid)) continue;
      const previous = preserved.get(line.lineItemGid);
      line.unitCostUsed = previous == null ? null : D(previous);
      line.cogs = line.unitCostUsed == null ? D(0) : line.unitCostUsed.mul(line.quantity);
      line.missingCost = line.unitCostUsed == null;
    }
    computed.cogs = computed.lines.filter((line) => !line.isGiftCard).reduce((acc, line) => acc.plus(line.cogs), D(0));
    computed.missingCostUnits = computed.lines
      .filter((line) => !line.isGiftCard && line.missingCost)
      .reduce((count, line) => count + line.quantity, 0);
  }

  if (computed.feeWarnings.length > 0) {
    console.info(
      `fee rules missing on ${dto.orderGid}: ${computed.feeWarnings.length} gateway(s) without a rule`,
    );
  }

  const grossLineSales = computed.lines.reduce((acc, line) => acc.plus(line.originalTotal), D(0));
  const lineDiscounts = computed.lines.reduce((acc, line) => acc.plus(line.discountTotal), D(0));
  const dates = new Set<string>([saleDate]);

  const order = await db.order.upsert({
    where: { shopId_orderGid: { shopId: shop.id, orderGid: dto.orderGid } },
    create: {
      shopId: shop.id,
      orderGid: dto.orderGid,
      name: dto.name,
      processedAt: new Date(dto.processedAt),
      localDate: toDbDate(saleDate),
      cancelledAt: dto.cancelledAt ? new Date(dto.cancelledAt) : null,
      test: dto.test,
      taxesIncluded: dto.taxesIncluded,
      requiresShipping: computed.requiresShipping,
      currencyCode: dto.currencyCode,
      presentmentCurrency: dto.presentmentCurrencyCode,
      sourceName: dto.sourceName,
      grossLineSales: toDb(grossLineSales),
      lineDiscounts: toDb(lineDiscounts),
      lineTax: toDb(computed.lineTax),
      shippingCharged: toDb(computed.shippingCharged),
      shippingTax: toDb(computed.shippingTax),
      totalTax: toDb(dto.totalTax),
      totalPrice: toDb(dto.totalPrice),
      dutiesAndFees: toDb(dto.duties.plus(dto.additionalFees)),
      tips: toDb(dto.tips),
      paymentFees: toDb(computed.paymentFees),
      feesAreActual: computed.feesAreActual,
      gateways: dto.paymentGatewayNames,
      shippingCost: toDb(computed.shippingCost),
      shopifyUpdatedAt: new Date(dto.updatedAt),
    },
    update: {
      name: dto.name,
      processedAt: new Date(dto.processedAt),
      localDate: toDbDate(saleDate),
      cancelledAt: dto.cancelledAt ? new Date(dto.cancelledAt) : null,
      test: dto.test,
      taxesIncluded: dto.taxesIncluded,
      requiresShipping: computed.requiresShipping,
      currencyCode: dto.currencyCode,
      presentmentCurrency: dto.presentmentCurrencyCode,
      sourceName: dto.sourceName,
      grossLineSales: toDb(grossLineSales),
      lineDiscounts: toDb(lineDiscounts),
      lineTax: toDb(computed.lineTax),
      shippingCharged: toDb(computed.shippingCharged),
      shippingTax: toDb(computed.shippingTax),
      totalTax: toDb(dto.totalTax),
      totalPrice: toDb(dto.totalPrice),
      dutiesAndFees: toDb(dto.duties.plus(dto.additionalFees)),
      tips: toDb(dto.tips),
      paymentFees: toDb(computed.paymentFees),
      feesAreActual: computed.feesAreActual,
      gateways: dto.paymentGatewayNames,
      shippingCost: toDb(computed.shippingCost),
      shopifyUpdatedAt: new Date(dto.updatedAt),
    },
  });

  const lineGids = computed.lines.map((line) => line.lineItemGid);
  await db.orderLine.deleteMany({
    where: { orderId: order.id, lineItemGid: { notIn: lineGids.length ? lineGids : ["__none__"] } },
  });
  for (const line of computed.lines) {
    const data = {
      variantGid: line.variantGid,
      productGid: line.productGid,
      title: line.title,
      sku: line.sku,
      quantity: line.quantity,
      isGiftCard: line.isGiftCard,
      originalTotal: toDb(line.originalTotal),
      discountTotal: toDb(line.discountTotal),
      taxTotal: toDb(line.taxTotal),
      netSalesExTax: toDb(line.netSalesExTax),
      unitCostUsed: line.unitCostUsed == null ? null : toDb(line.unitCostUsed),
      cogs: toDb(line.cogs),
    };
    await db.orderLine.upsert({
      where: { orderId_lineItemGid: { orderId: order.id, lineItemGid: line.lineItemGid } },
      create: { orderId: order.id, lineItemGid: line.lineItemGid, ...data },
      update: data,
    });
  }

  const refundGids = dto.refunds.map((refund) => refund.refundGid);
  await db.refund.deleteMany({
    where: { orderId: order.id, refundGid: { notIn: refundGids.length ? refundGids : ["__none__"] } },
  });
  for (const refund of dto.refunds) {
    const amounts = computeRefund(refund, computed.lines.map((line) => ({
      lineItemGid: line.lineItemGid,
      unitCostUsed: line.unitCostUsed,
    })));
    const refundDate = localDate(refund.processedAt, shop.ianaTimezone);
    dates.add(refundDate);
    const expected = amounts.lineSubtotal
      .plus(amounts.lineTax)
      .plus(amounts.shippingSubtotal)
      .plus(amounts.shippingTax)
      .plus(amounts.adjustments);
    const drift = amounts.totalRefunded.minus(expected).abs();
    if (drift.gt("0.05")) {
      console.info(`refund total drift ${drift.toFixed(4)} on ${refund.refundGid}`);
    }
    const saved = await db.refund.upsert({
      where: { shopId_refundGid: { shopId: shop.id, refundGid: refund.refundGid } },
      create: {
        shopId: shop.id,
        orderId: order.id,
        refundGid: refund.refundGid,
        processedAt: new Date(refund.processedAt),
        localDate: toDbDate(refundDate),
        totalRefunded: toDb(amounts.totalRefunded),
        lineSubtotal: toDb(amounts.lineSubtotal),
        lineTax: toDb(amounts.lineTax),
        shippingSubtotal: toDb(amounts.shippingSubtotal),
        shippingTax: toDb(amounts.shippingTax),
        adjustments: toDb(amounts.adjustments),
        adjustmentsTax: toDb(amounts.adjustmentsTax),
        restockedCogs: toDb(amounts.restockedCogs),
        refundedFees: toDb(amounts.refundedFees),
      },
      update: {
        processedAt: new Date(refund.processedAt),
        localDate: toDbDate(refundDate),
        totalRefunded: toDb(amounts.totalRefunded),
        lineSubtotal: toDb(amounts.lineSubtotal),
        lineTax: toDb(amounts.lineTax),
        shippingSubtotal: toDb(amounts.shippingSubtotal),
        shippingTax: toDb(amounts.shippingTax),
        adjustments: toDb(amounts.adjustments),
        adjustmentsTax: toDb(amounts.adjustmentsTax),
        restockedCogs: toDb(amounts.restockedCogs),
        refundedFees: toDb(amounts.refundedFees),
      },
    });
    await db.refundLine.deleteMany({ where: { refundId: saved.id } });
    if (refund.lines.length > 0) {
      await db.refundLine.createMany({
        data: refund.lines.map((line) => ({
          refundId: saved.id,
          lineItemGid: line.lineItemGid,
          variantGid: line.variantGid ?? null,
          quantity: line.quantity,
          restocked: line.restocked,
          subtotal: toDb(line.subtotal),
          tax: toDb(line.tax),
        })),
      });
    }
  }

  return [...dates];
}

export async function syncOrder(admin: AdminClient, shopDomain: string, orderGid: string, recalcCosts = false) {
  const shop = await db.shop.findUnique({ where: { shopDomain } });
  if (!shop || shop.uninstalledAt) return;
  const data = await adminQuery<{ order: JsonObject | null }>(admin, ORDER_FOR_PROFIT, { id: orderGid });
  if (!data.order) return;
  const dto = orderFromGraphql(data.order);
  if (!dto) return;
  const dates = await upsertOrderGraph(shop, dto, { recalcCosts });
  await rebuildDays(shop.id, dates);
}

export async function deleteOrder(shopDomain: string, orderGid: string) {
  const shop = await db.shop.findUnique({ where: { shopDomain } });
  if (!shop) return;
  const existing = await db.order.findUnique({
    where: { shopId_orderGid: { shopId: shop.id, orderGid } },
    include: { refunds: true },
  });
  if (!existing) return;
  const dates = [
    fromDbDate(existing.localDate),
    ...existing.refunds.map((refund) => fromDbDate(refund.localDate)),
  ];
  await db.order.delete({ where: { id: existing.id } });
  await rebuildDays(shop.id, dates);
}

export async function recomputeShipping(shopId: string): Promise<void> {
  const shop = await db.shop.findUnique({ where: { id: shopId }, include: { shippingCosts: true } });
  if (!shop) return;
  const overrides = new Map(shop.shippingCosts.map((row) => [row.orderName, D(row.amount)]));
  const orders = await db.order.findMany({ where: { shopId } });
  const dates: string[] = [];
  for (const order of orders) {
    const shippingRevenue = order.taxesIncluded
      ? D(order.shippingCharged).minus(D(order.shippingTax))
      : D(order.shippingCharged);
    const shippingCost = shippingCostFor({
      mode: shop.shippingCostMode,
      flat: D(shop.shippingFlatCost),
      percent: D(shop.shippingPercent),
      shippingRevenue,
      requiresShipping: order.requiresShipping,
      manualOverride: overrides.get(order.name) ?? null,
    });
    await db.order.update({ where: { id: order.id }, data: { shippingCost: toDb(shippingCost) } });
    dates.push(fromDbDate(order.localDate));
  }
  await rebuildDays(shopId, dates);
}

export async function recalculateHistory(shopId: string): Promise<void> {
  const shop = await db.shop.findUnique({ where: { id: shopId } });
  if (!shop) return;
  const resolver = await loadResolver(shop);
  const orders = await db.order.findMany({ where: { shopId }, include: { lines: true, refunds: true } });
  const dates: string[] = [];
  for (const order of orders) {
    const saleDate = fromDbDate(order.localDate);
    dates.push(saleDate);
    for (const line of order.lines) {
      if (line.isGiftCard) continue;
      const resolved = resolver(line.variantGid, saleDate, line.sku);
      const cogs = resolved.unitCost == null ? D(0) : resolved.unitCost.mul(line.quantity);
      await db.orderLine.update({
        where: { id: line.id },
        data: { unitCostUsed: resolved.unitCost == null ? null : toDb(resolved.unitCost), cogs: toDb(cogs) },
      });
    }
    for (const refund of order.refunds) dates.push(fromDbDate(refund.localDate));
  }
  await rebuildDays(shopId, dates);
}
