import { D, sum, type Decimal } from "../money";
import { paymentFees, type FeeMode, type FeeTransaction, type GatewayRule } from "./fees";

export interface LineInput {
  lineItemGid: string;
  title: string;
  sku?: string | null;
  quantity: number;
  isGiftCard: boolean;
  requiresShipping: boolean;
  variantGid?: string | null;
  productGid?: string | null;
  originalTotal: Decimal;
  discountTotal: Decimal;
  taxTotal: Decimal;
}

export interface ShippingLineInput {
  id?: string;
  isRemoved: boolean;
  discountedPrice: Decimal;
  taxTotal: Decimal;
}

export interface OrderInput {
  taxesIncluded: boolean;
  localDate: string;
  lines: LineInput[];
  shippingLines: ShippingLineInput[];
  transactions: FeeTransaction[];
}

export interface ProfitSettings {
  feeMode: FeeMode;
  gatewayRules: GatewayRule[];
  shippingCostMode: "NONE" | "FLAT_PER_ORDER" | "PERCENT_OF_SHIPPING_CHARGED" | "PER_ORDER_MANUAL";
  shippingFlatCost: Decimal;
  /** Fraction, 0.15 = 15%. */
  shippingPercent: Decimal;
  /** ShippingCost row matched by order name. Overrides the mode when present. */
  manualShippingCost: Decimal | null;
}

export type CostResolver = (
  variantGid: string | null | undefined,
  localDate: string,
  sku: string | null | undefined,
) => { unitCost: Decimal | null; missing: boolean };

export interface ComputedLine {
  lineItemGid: string;
  title: string;
  sku: string | null;
  quantity: number;
  isGiftCard: boolean;
  requiresShipping: boolean;
  variantGid: string | null;
  productGid: string | null;
  originalTotal: Decimal;
  discountTotal: Decimal;
  taxTotal: Decimal;
  netSalesExTax: Decimal;
  grossExTax: Decimal;
  unitCostUsed: Decimal | null;
  cogs: Decimal;
  missingCost: boolean;
}

export interface ComputedOrder {
  lines: ComputedLine[];
  grossSales: Decimal;
  discounts: Decimal;
  lineTax: Decimal;
  shippingCharged: Decimal;
  shippingTax: Decimal;
  shippingRevenue: Decimal;
  cogs: Decimal;
  missingCostUnits: number;
  paymentFees: Decimal;
  feesAreActual: boolean;
  feeWarnings: string[];
  shippingCost: Decimal;
  requiresShipping: boolean;
  /** net sales (ex tax, after discounts, gift cards excluded) + shipping revenue. */
  revenue: Decimal;
}

export function lineNetSalesExTax(
  originalTotal: Decimal,
  discountTotal: Decimal,
  taxTotal: Decimal,
  taxesIncluded: boolean,
): Decimal {
  return D(originalTotal).minus(D(discountTotal)).minus(taxesIncluded ? D(taxTotal) : 0);
}

export function lineGrossExTax(
  originalTotal: Decimal,
  taxTotal: Decimal,
  taxesIncluded: boolean,
): Decimal {
  return D(originalTotal).minus(taxesIncluded ? D(taxTotal) : 0);
}

export function shippingCostFor(input: {
  mode: ProfitSettings["shippingCostMode"];
  flat: Decimal;
  percent: Decimal;
  shippingRevenue: Decimal;
  requiresShipping: boolean;
  manualOverride: Decimal | null;
}): Decimal {
  if (input.manualOverride != null) return D(input.manualOverride);
  if (input.mode === "NONE" || input.mode === "PER_ORDER_MANUAL") return D(0);
  if (input.mode === "FLAT_PER_ORDER") {
    return input.requiresShipping ? D(input.flat) : D(0);
  }
  return D(input.shippingRevenue).mul(D(input.percent));
}

export function computeOrder(
  order: OrderInput,
  settings: ProfitSettings,
  costResolver: CostResolver,
): ComputedOrder {
  const lines: ComputedLine[] = order.lines.map((line) => {
    const netSalesExTax = lineNetSalesExTax(
      line.originalTotal,
      line.discountTotal,
      line.taxTotal,
      order.taxesIncluded,
    );
    const grossExTax = lineGrossExTax(line.originalTotal, line.taxTotal, order.taxesIncluded);
    if (line.isGiftCard) {
      return {
        lineItemGid: line.lineItemGid,
        title: line.title,
        sku: line.sku ?? null,
        quantity: line.quantity,
        isGiftCard: true,
        requiresShipping: line.requiresShipping,
        variantGid: line.variantGid ?? null,
        productGid: line.productGid ?? null,
        originalTotal: D(line.originalTotal),
        discountTotal: D(line.discountTotal),
        taxTotal: D(line.taxTotal),
        netSalesExTax,
        grossExTax,
        unitCostUsed: null,
        cogs: D(0),
        missingCost: false,
      };
    }
    const resolved = costResolver(line.variantGid, order.localDate, line.sku);
    const cogs = resolved.unitCost == null ? D(0) : resolved.unitCost.mul(line.quantity);
    return {
      lineItemGid: line.lineItemGid,
      title: line.title,
      sku: line.sku ?? null,
      quantity: line.quantity,
      isGiftCard: false,
      requiresShipping: line.requiresShipping,
      variantGid: line.variantGid ?? null,
      productGid: line.productGid ?? null,
      originalTotal: D(line.originalTotal),
      discountTotal: D(line.discountTotal),
      taxTotal: D(line.taxTotal),
      netSalesExTax,
      grossExTax,
      unitCostUsed: resolved.unitCost,
      cogs,
      missingCost: resolved.missing,
    };
  });

  const productLines = lines.filter((line) => !line.isGiftCard);
  const activeShipping = order.shippingLines.filter((line) => !line.isRemoved);
  const shippingCharged = sum(activeShipping.map((line) => line.discountedPrice));
  const shippingTax = sum(activeShipping.map((line) => line.taxTotal));
  const shippingRevenue = order.taxesIncluded ? shippingCharged.minus(shippingTax) : shippingCharged;
  const requiresShipping =
    lines.some((line) => line.requiresShipping && !line.isGiftCard) || activeShipping.length > 0;
  const fees = paymentFees(order.transactions, settings.gatewayRules, settings.feeMode);
  const shippingCost = shippingCostFor({
    mode: settings.shippingCostMode,
    flat: settings.shippingFlatCost,
    percent: settings.shippingPercent,
    shippingRevenue,
    requiresShipping,
    manualOverride: settings.manualShippingCost,
  });
  const grossSales = sum(productLines.map((line) => line.grossExTax));
  const discounts = sum(productLines.map((line) => line.discountTotal));
  const netSales = grossSales.minus(discounts);

  return {
    lines,
    grossSales,
    discounts,
    lineTax: sum(productLines.map((line) => line.taxTotal)),
    shippingCharged,
    shippingTax,
    shippingRevenue,
    cogs: sum(productLines.map((line) => line.cogs)),
    missingCostUnits: productLines.reduce(
      (count, line) => count + (line.missingCost ? line.quantity : 0),
      0,
    ),
    paymentFees: fees.amount,
    feesAreActual: fees.actual,
    feeWarnings: fees.warnings,
    shippingCost,
    requiresShipping,
    revenue: netSales.plus(shippingRevenue),
  };
}
