import { D, type Decimal } from "../money";

/** Same fallback as computeRefund: a money-only refund is booked as returns. */
export function returnsFromParts(input: {
  lineSubtotal: Decimal;
  shippingSubtotal: Decimal;
  adjustments: Decimal;
  totalRefunded: Decimal;
}): Decimal {
  let returns = D(input.lineSubtotal).plus(D(input.adjustments));
  if (
    D(input.lineSubtotal).isZero() &&
    D(input.shippingSubtotal).isZero() &&
    D(input.adjustments).isZero() &&
    D(input.totalRefunded).gt(0)
  ) {
    returns = returns.plus(D(input.totalRefunded));
  }
  return returns;
}
