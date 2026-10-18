import { D, sum, type Decimal } from "../money";

export interface DailyOrderInput {
  key: string;
  localDate: string;
  cancelledLocalDate: string | null;
  test: boolean;
  totalPrice: Decimal;
  grossSales: Decimal;
  discounts: Decimal;
  shippingRevenue: Decimal;
  tax: Decimal;
  cogs: Decimal;
  shippingCost: Decimal;
  paymentFees: Decimal;
  missingCostUnits: number;
  lines: DailyProductLine[];
}

export interface DailyProductLine {
  productGid: string;
  quantity: number;
  netSales: Decimal;
  cogs: Decimal;
}

export interface DailyRefundInput {
  orderKey: string;
  localDate: string;
  totalRefunded: Decimal;
  returns: Decimal;
  refundShipping: Decimal;
  restockedCogs: Decimal;
  refundedFees: Decimal;
  tax: Decimal;
  lines: Array<{
    productGid: string;
    quantity: number;
    subtotal: Decimal;
    restocked: boolean;
    restockedCogs: Decimal;
  }>;
}

export interface DailySettings {
  includeTestOrders: boolean;
  excludeCancelled: boolean;
}

export interface DailyFigures {
  orders: number;
  grossSales: Decimal;
  discounts: Decimal;
  returns: Decimal;
  netSales: Decimal;
  shippingRevenue: Decimal;
  taxCollected: Decimal;
  revenue: Decimal;
  cogs: Decimal;
  shippingCost: Decimal;
  paymentFees: Decimal;
  adSpend: Decimal;
  expenses: Decimal;
  grossProfit: Decimal;
  contribution: Decimal;
  netProfit: Decimal;
  missingCostUnits: number;
}

export interface ProductFigures {
  unitsSold: number;
  unitsReturned: number;
  netSales: Decimal;
  cogs: Decimal;
  allocatedFees: Decimal;
  grossProfit: Decimal;
}

export interface RangeRatios {
  revenue: Decimal;
  netProfit: Decimal;
  grossProfit: Decimal;
  adSpend: Decimal;
  margin: Decimal | null;
  grossMargin: Decimal | null;
  mer: Decimal | null;
}

function emptyDay(): DailyFigures {
  return {
    orders: 0,
    grossSales: D(0),
    discounts: D(0),
    returns: D(0),
    netSales: D(0),
    shippingRevenue: D(0),
    taxCollected: D(0),
    revenue: D(0),
    cogs: D(0),
    shippingCost: D(0),
    paymentFees: D(0),
    adSpend: D(0),
    expenses: D(0),
    grossProfit: D(0),
    contribution: D(0),
    netProfit: D(0),
    missingCostUnits: 0,
  };
}

function emptyProduct(): ProductFigures {
  return {
    unitsSold: 0,
    unitsReturned: 0,
    netSales: D(0),
    cogs: D(0),
    allocatedFees: D(0),
    grossProfit: D(0),
  };
}

/**
 * Drop test orders unless included.
 * Drop a cancelled order (and its refunds) when excludeCancelled is on, the
 * cancellation is on the order's local day, and same-day refunds cover totalPrice.
 */
export function droppedOrderKeys(
  orders: DailyOrderInput[],
  refunds: DailyRefundInput[],
  settings: DailySettings,
): Set<string> {
  const dropped = new Set<string>();
  for (const order of orders) {
    if (order.test && !settings.includeTestOrders) {
      dropped.add(order.key);
      continue;
    }
    if (!settings.excludeCancelled || !order.cancelledLocalDate) continue;
    if (order.cancelledLocalDate !== order.localDate) continue;
    const sameDay = refunds.filter(
      (refund) => refund.orderKey === order.key && refund.localDate === order.localDate,
    );
    const refunded = sum(sameDay.map((refund) => refund.totalRefunded));
    if (D(order.totalPrice).gt(0) && refunded.gte(D(order.totalPrice))) {
      dropped.add(order.key);
    }
  }
  return dropped;
}

export function finalizeDay(day: DailyFigures): DailyFigures {
  const netSales = day.grossSales.minus(day.discounts).minus(day.returns);
  const revenue = netSales.plus(day.shippingRevenue);
  const grossProfit = revenue.minus(day.cogs);
  const contribution = grossProfit.minus(day.paymentFees).minus(day.shippingCost).minus(day.adSpend);
  const netProfit = contribution.minus(day.expenses);
  return { ...day, netSales, revenue, grossProfit, contribution, netProfit };
}

export function accumulateDays(input: {
  orders: DailyOrderInput[];
  refunds: DailyRefundInput[];
  adSpend: Array<{ date: string; amount: Decimal }>;
  expenses: Array<{ date: string; amount: Decimal }>;
  settings: DailySettings;
}): { days: Map<string, DailyFigures>; products: Map<string, Map<string, ProductFigures>> } {
  const dropped = droppedOrderKeys(input.orders, input.refunds, input.settings);
  const days = new Map<string, DailyFigures>();
  const products = new Map<string, Map<string, ProductFigures>>();

  const day = (date: string) => {
    let row = days.get(date);
    if (!row) {
      row = emptyDay();
      days.set(date, row);
    }
    return row;
  };
  const product = (date: string, productGid: string) => {
    let bucket = products.get(date);
    if (!bucket) {
      bucket = new Map();
      products.set(date, bucket);
    }
    let row = bucket.get(productGid);
    if (!row) {
      row = emptyProduct();
      bucket.set(productGid, row);
    }
    return row;
  };

  for (const order of input.orders) {
    if (dropped.has(order.key)) continue;
    const row = day(order.localDate);
    row.orders += 1;
    row.grossSales = row.grossSales.plus(order.grossSales);
    row.discounts = row.discounts.plus(order.discounts);
    row.shippingRevenue = row.shippingRevenue.plus(order.shippingRevenue);
    row.taxCollected = row.taxCollected.plus(order.tax);
    row.cogs = row.cogs.plus(order.cogs);
    row.shippingCost = row.shippingCost.plus(order.shippingCost);
    row.paymentFees = row.paymentFees.plus(order.paymentFees);
    row.missingCostUnits += order.missingCostUnits;

    const netBase = sum(order.lines.map((line) => line.netSales));
    for (const line of order.lines) {
      const share = netBase.isZero() ? D(0) : D(order.paymentFees).mul(D(line.netSales).div(netBase));
      const bucket = product(order.localDate, line.productGid || "unknown");
      bucket.unitsSold += line.quantity;
      bucket.netSales = bucket.netSales.plus(line.netSales);
      bucket.cogs = bucket.cogs.plus(line.cogs);
      bucket.allocatedFees = bucket.allocatedFees.plus(share);
    }
  }

  for (const refund of input.refunds) {
    if (dropped.has(refund.orderKey)) continue;
    const row = day(refund.localDate);
    row.returns = row.returns.plus(refund.returns);
    row.shippingRevenue = row.shippingRevenue.minus(refund.refundShipping);
    row.cogs = row.cogs.minus(refund.restockedCogs);
    row.paymentFees = row.paymentFees.minus(refund.refundedFees);
    row.taxCollected = row.taxCollected.minus(refund.tax);
    for (const line of refund.lines) {
      const bucket = product(refund.localDate, line.productGid || "unknown");
      bucket.unitsReturned += line.quantity;
      bucket.netSales = bucket.netSales.minus(line.subtotal);
      if (line.restocked) bucket.cogs = bucket.cogs.minus(line.restockedCogs);
    }
  }

  for (const spend of input.adSpend) {
    day(spend.date).adSpend = day(spend.date).adSpend.plus(spend.amount);
  }
  for (const expense of input.expenses) {
    day(expense.date).expenses = day(expense.date).expenses.plus(expense.amount);
  }

  for (const [date, row] of days) {
    days.set(date, finalizeDay(row));
  }
  for (const bucket of products.values()) {
    for (const row of bucket.values()) {
      row.grossProfit = row.netSales.minus(row.cogs).minus(row.allocatedFees);
    }
  }
  return { days, products };
}

/** Ratios from range sums. Never the average of daily ratios. */
export function ratiosFromSums(
  days: Array<{ revenue: Decimal; netProfit: Decimal; grossProfit: Decimal; adSpend: Decimal }>,
): RangeRatios {
  const revenue = sum(days.map((day) => day.revenue));
  const netProfit = sum(days.map((day) => day.netProfit));
  const grossProfit = sum(days.map((day) => day.grossProfit));
  const adSpend = sum(days.map((day) => day.adSpend));
  return {
    revenue,
    netProfit,
    grossProfit,
    adSpend,
    margin: revenue.isZero() ? null : netProfit.div(revenue),
    grossMargin: revenue.isZero() ? null : grossProfit.div(revenue),
    mer: adSpend.isZero() ? null : revenue.div(adSpend),
  };
}
