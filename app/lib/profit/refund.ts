import { D, sum, type Decimal } from "../money";
import { refundedFees as sumRefundFees } from "./fees";

export interface RefundLineInput {
  lineItemGid: string;
  variantGid?: string | null;
  quantity: number;
  restocked: boolean;
  subtotal: Decimal;
  tax: Decimal;
}

export interface RefundInput {
  totalRefunded: Decimal;
  lines: RefundLineInput[];
  shippingLines: Array<{ subtotal: Decimal; tax: Decimal }>;
  adjustments: Array<{ amount: Decimal; tax: Decimal }>;
  transactions?: Array<{ kind: string; status: string; fees: Decimal[] }>;
}

export interface OrderLineCost {
  lineItemGid: string;
  unitCostUsed: Decimal | null;
}

export interface ComputedRefund {
  lineSubtotal: Decimal;
  lineTax: Decimal;
  shippingSubtotal: Decimal;
  shippingTax: Decimal;
  adjustments: Decimal;
  adjustmentsTax: Decimal;
  returns: Decimal;
  refundShipping: Decimal;
  restockedCogs: Decimal;
  refundedFees: Decimal;
  totalRefunded: Decimal;
}

/**
 * Returns = merchandise subtotal + order adjustments.
 * A refund with no merchandise, shipping, or adjustment amounts books totalRefunded as returns.
 * COGS reverses only for restocked lines (quantity × original unitCostUsed).
 */
export function computeRefund(dto: RefundInput, orderLines: OrderLineCost[]): ComputedRefund {
  const lineSubtotal = sum(dto.lines.map((line) => line.subtotal));
  const lineTax = sum(dto.lines.map((line) => line.tax));
  const shippingSubtotal = sum(dto.shippingLines.map((line) => line.subtotal));
  const shippingTax = sum(dto.shippingLines.map((line) => line.tax));
  const adjustments = sum(dto.adjustments.map((row) => row.amount));
  const adjustmentsTax = sum(dto.adjustments.map((row) => row.tax));

  let returns = lineSubtotal.plus(adjustments);
  if (lineSubtotal.isZero() && shippingSubtotal.isZero() && adjustments.isZero() && D(dto.totalRefunded).gt(0)) {
    returns = returns.plus(D(dto.totalRefunded));
  }

  const costByLine = new Map(orderLines.map((line) => [line.lineItemGid, line.unitCostUsed]));
  let restockedCogs = D(0);
  for (const line of dto.lines) {
    if (!line.restocked) continue;
    const unit = costByLine.get(line.lineItemGid);
    if (unit == null) continue;
    restockedCogs = restockedCogs.plus(D(unit).mul(line.quantity));
  }

  return {
    lineSubtotal,
    lineTax,
    shippingSubtotal,
    shippingTax,
    adjustments,
    adjustmentsTax,
    returns,
    refundShipping: shippingSubtotal,
    restockedCogs,
    refundedFees: dto.transactions ? sumRefundFees(dto.transactions) : D(0),
    totalRefunded: D(dto.totalRefunded),
  };
}
