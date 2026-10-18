import type { Prisma } from "@prisma/client";
import db from "../../db.server";
import { D, toDb, type Decimal } from "../money";
import { fromDbDate, localDate, toDbDate } from "../tz";
import { accumulateDays, type DailyOrderInput, type DailyRefundInput } from "./daily";
import { dailyShare } from "./expenses";
import { returnsFromParts } from "./refund-parts";

function dec(value: Prisma.Decimal | Decimal | string | number): Decimal {
  return D(value.toString());
}

export async function rebuildDays(shopId: string, dates: string[]): Promise<void> {
  const unique = [...new Set(dates.filter(Boolean))].sort();
  if (unique.length === 0) return;
  const shop = await db.shop.findUnique({ where: { id: shopId } });
  if (!shop) return;

  const min = toDbDate(unique[0]);
  const max = toDbDate(unique[unique.length - 1]);
  const ordersInRange = await db.order.findMany({
    where: { shopId, localDate: { gte: min, lte: max } },
    include: { lines: true },
  });
  const refundsInRange = await db.refund.findMany({
    where: { shopId, localDate: { gte: min, lte: max } },
    include: { lines: true },
  });
  const relatedIds = [...new Set(refundsInRange.map((refund) => refund.orderId))];
  const known = new Set(ordersInRange.map((order) => order.id));
  const extraOrders = relatedIds.length
    ? await db.order.findMany({
        where: { id: { in: relatedIds.filter((id) => !known.has(id)) } },
        include: { lines: true },
      })
    : [];
  const orders = [...ordersInRange, ...extraOrders];
  const linesByOrder = new Map(orders.map((order) => [order.id, order.lines]));

  const orderInputs: DailyOrderInput[] = orders.map((order) => {
    const productLines = order.lines.filter((line) => !line.isGiftCard);
    return {
      key: order.id,
      localDate: fromDbDate(order.localDate),
      cancelledLocalDate: order.cancelledAt ? localDate(order.cancelledAt, shop.ianaTimezone) : null,
      test: order.test,
      totalPrice: dec(order.totalPrice),
      grossSales: productLines.reduce(
        (acc, line) => acc.plus(dec(line.netSalesExTax).plus(dec(line.discountTotal))),
        D(0),
      ),
      discounts: productLines.reduce((acc, line) => acc.plus(dec(line.discountTotal)), D(0)),
      shippingRevenue: order.taxesIncluded
        ? dec(order.shippingCharged).minus(dec(order.shippingTax))
        : dec(order.shippingCharged),
      tax: dec(order.lineTax).plus(dec(order.shippingTax)),
      cogs: productLines.reduce((acc, line) => acc.plus(dec(line.cogs)), D(0)),
      shippingCost: dec(order.shippingCost),
      paymentFees: dec(order.paymentFees),
      missingCostUnits: productLines.reduce(
        (count, line) => count + (line.unitCostUsed == null ? line.quantity : 0),
        0,
      ),
      lines: productLines.map((line) => ({
        productGid: line.productGid || "unknown",
        quantity: line.quantity,
        netSales: dec(line.netSalesExTax),
        cogs: dec(line.cogs),
      })),
    };
  });

  const refundInputs: DailyRefundInput[] = refundsInRange.map((refund) => {
    const orderLines = linesByOrder.get(refund.orderId) ?? [];
    const byGid = new Map(orderLines.map((line) => [line.lineItemGid, line]));
    const lines = refund.lines.flatMap((line) => {
      const orderLine = byGid.get(line.lineItemGid);
      if (orderLine?.isGiftCard) return [];
      const reversal =
        line.restocked && orderLine?.unitCostUsed != null
          ? dec(orderLine.unitCostUsed).mul(line.quantity)
          : D(0);
      return [
        {
          productGid: orderLine?.productGid || "unknown",
          quantity: line.quantity,
          subtotal: dec(line.subtotal),
          restocked: line.restocked,
          restockedCogs: reversal,
        },
      ];
    });
    const restockedCogs = lines.reduce((acc, line) => acc.plus(line.restockedCogs), D(0));
    return {
      orderKey: refund.orderId,
      localDate: fromDbDate(refund.localDate),
      totalRefunded: dec(refund.totalRefunded),
      returns: returnsFromParts({
        lineSubtotal: dec(refund.lineSubtotal),
        shippingSubtotal: dec(refund.shippingSubtotal),
        adjustments: dec(refund.adjustments),
        totalRefunded: dec(refund.totalRefunded),
      }),
      refundShipping: dec(refund.shippingSubtotal),
      restockedCogs,
      refundedFees: dec(refund.refundedFees),
      tax: dec(refund.lineTax).plus(dec(refund.shippingTax)).plus(dec(refund.adjustmentsTax)),
      lines,
    };
  });

  const adRows = await db.adSpend.findMany({
    where: { shopId, date: { gte: min, lte: max } },
  });
  const expenses = await db.expense.findMany({ where: { shopId } });
  const expenseShares = unique.flatMap((date) => {
    const amount = expenses.reduce(
      (acc, expense) =>
        acc.plus(
          dailyShare(
            {
              amount: dec(expense.amount),
              frequency: expense.frequency,
              startDate: fromDbDate(expense.startDate),
              endDate: expense.endDate ? fromDbDate(expense.endDate) : null,
            },
            date,
          ),
        ),
      D(0),
    );
    return amount.isZero() ? [] : [{ date, amount }];
  });

  const { days, products } = accumulateDays({
    orders: orderInputs,
    refunds: refundInputs,
    adSpend: adRows.map((row) => ({ date: fromDbDate(row.date), amount: dec(row.amount) })),
    expenses: expenseShares,
    settings: { includeTestOrders: shop.includeTestOrders, excludeCancelled: shop.excludeCancelled },
  });

  for (const date of unique) {
    const row = days.get(date);
    const data = {
      orders: row?.orders ?? 0,
      grossSales: toDb(row?.grossSales ?? 0),
      discounts: toDb(row?.discounts ?? 0),
      returns: toDb(row?.returns ?? 0),
      netSales: toDb(row?.netSales ?? 0),
      shippingRevenue: toDb(row?.shippingRevenue ?? 0),
      taxCollected: toDb(row?.taxCollected ?? 0),
      revenue: toDb(row?.revenue ?? 0),
      cogs: toDb(row?.cogs ?? 0),
      shippingCost: toDb(row?.shippingCost ?? 0),
      paymentFees: toDb(row?.paymentFees ?? 0),
      adSpend: toDb(row?.adSpend ?? 0),
      expenses: toDb(row?.expenses ?? 0),
      grossProfit: toDb(row?.grossProfit ?? 0),
      contribution: toDb(row?.contribution ?? 0),
      netProfit: toDb(row?.netProfit ?? 0),
      missingCostUnits: row?.missingCostUnits ?? 0,
      computedAt: new Date(),
    };
    await db.dailyMetric.upsert({
      where: { shopId_date: { shopId, date: toDbDate(date) } },
      create: { shopId, date: toDbDate(date), ...data },
      update: data,
    });
    await db.productDailyMetric.deleteMany({ where: { shopId, date: toDbDate(date) } });
    const bucket = products.get(date);
    if (!bucket) continue;
    await db.productDailyMetric.createMany({
      data: [...bucket.entries()].map(([productGid, product]) => ({
        shopId,
        date: toDbDate(date),
        productGid,
        unitsSold: product.unitsSold,
        unitsReturned: product.unitsReturned,
        netSales: toDb(product.netSales),
        cogs: toDb(product.cogs),
        allocatedFees: toDb(product.allocatedFees),
        grossProfit: toDb(product.grossProfit),
      })),
    });
  }
}
