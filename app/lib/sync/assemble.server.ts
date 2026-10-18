import { D, moneyAmount, shopAmount, sum, type Decimal } from "../money";
import type { FeeTransaction } from "../profit/fees";
import type { LineInput, ShippingLineInput } from "../profit/order";
import type { RefundInput, RefundLineInput } from "../profit/refund";

export interface JsonObject {
  [key: string]: unknown;
}

export interface NormalizedOrder {
  orderGid: string;
  name: string;
  processedAt: string;
  cancelledAt: string | null;
  test: boolean;
  taxesIncluded: boolean;
  currencyCode: string;
  presentmentCurrencyCode: string;
  sourceName: string | null;
  updatedAt: string;
  paymentGatewayNames: string[];
  totalPrice: Decimal;
  totalTax: Decimal;
  duties: Decimal;
  additionalFees: Decimal;
  tips: Decimal;
  lines: LineInput[];
  shippingLines: ShippingLineInput[];
  transactions: FeeTransaction[];
  refunds: Array<RefundInput & { refundGid: string; processedAt: string }>;
}

export interface NormalizedVariant {
  variantGid: string;
  productGid: string;
  productTitle: string;
  variantTitle: string | null;
  sku: string | null;
  inventoryItemGid: string | null;
  shopifyUnitCost: Decimal | null;
}

function asObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonObject;
}

function asArray(value: unknown): JsonObject[] {
  if (!Array.isArray(value)) return [];
  return value.map(asObject).filter((item): item is JsonObject => item != null);
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function gidKind(id: string): string {
  const match = id.match(/gid:\/\/shopify\/([^/]+)\//);
  return match?.[1] ?? "";
}

function connectionNodes(value: unknown): JsonObject[] {
  const obj = asObject(value);
  if (!obj) return asArray(value);
  if (Array.isArray(obj.nodes)) return asArray(obj.nodes);
  if (Array.isArray(obj.edges)) {
    return obj.edges
      .map((edge) => asObject(asObject(edge)?.node))
      .filter((node): node is JsonObject => node != null);
  }
  return [];
}

function taxTotal(node: JsonObject): Decimal {
  return sum(asArray(node.taxLines).map((tax) => shopAmount(tax.priceSet)));
}

function readLine(node: JsonObject): LineInput | null {
  const id = str(node.id);
  if (!id) return null;
  const variant = asObject(node.variant);
  const product = asObject(variant?.product);
  return {
    lineItemGid: id,
    title: str(node.title) ?? "Item",
    sku: str(node.sku),
    quantity: typeof node.quantity === "number" ? node.quantity : Number(node.quantity ?? 0),
    isGiftCard: node.isGiftCard === true,
    requiresShipping: node.requiresShipping === true,
    variantGid: str(variant?.id),
    productGid: str(product?.id),
    originalTotal: shopAmount(node.originalTotalSet),
    discountTotal: shopAmount(node.totalDiscountSet),
    taxTotal: taxTotal(node),
  };
}

function readShipping(node: JsonObject): ShippingLineInput | null {
  return {
    id: str(node.id) ?? undefined,
    isRemoved: node.isRemoved === true,
    discountedPrice: shopAmount(node.discountedPriceSet),
    taxTotal: taxTotal(node),
  };
}

function readTransaction(node: JsonObject): FeeTransaction | null {
  const kind = str(node.kind);
  const status = str(node.status);
  if (!kind || !status) return null;
  const fees = asArray(node.fees).map((fee) => moneyAmount(fee.amount));
  return {
    kind,
    status,
    gateway: str(node.gateway),
    amount: shopAmount(node.amountSet),
    fees,
  };
}

function readRefundLine(node: JsonObject): RefundLineInput | null {
  const lineItem = asObject(node.lineItem);
  const variant = asObject(lineItem?.variant);
  const lineItemGid = str(lineItem?.id) ?? str(node.id);
  if (!lineItemGid) return null;
  return {
    lineItemGid,
    variantGid: str(variant?.id),
    quantity: typeof node.quantity === "number" ? node.quantity : Number(node.quantity ?? 0),
    restocked: node.restocked === true,
    subtotal: shopAmount(node.subtotalSet),
    tax: shopAmount(node.totalTaxSet),
  };
}

function readRefund(node: JsonObject, extras: JsonObject[]): NormalizedOrder["refunds"][number] | null {
  const refundGid = str(node.id);
  const processedAt = str(node.processedAt);
  if (!refundGid || !processedAt) return null;
  const lineNodes = [
    ...connectionNodes(node.refundLineItems),
    ...extras.filter((child) => gidKind(str(child.id) ?? "") === "RefundLineItem"),
  ];
  const shippingNodes = [
    ...connectionNodes(node.refundShippingLines),
    ...extras.filter((child) => gidKind(str(child.id) ?? "") === "RefundShippingLine"),
  ];
  const adjustmentNodes = [
    ...connectionNodes(node.orderAdjustments),
    ...extras.filter((child) => gidKind(str(child.id) ?? "") === "OrderAdjustment"),
  ];
  const transactionNodes = [
    ...connectionNodes(node.transactions),
    ...extras.filter((child) => gidKind(str(child.id) ?? "") === "OrderTransaction"),
  ];
  return {
    refundGid,
    processedAt,
    totalRefunded: shopAmount(node.totalRefundedSet),
    lines: lineNodes.map(readRefundLine).filter((line): line is RefundLineInput => line != null),
    shippingLines: shippingNodes.map((shipping) => ({
      subtotal: shopAmount(shipping.subtotalAmountSet),
      tax: shopAmount(shipping.taxAmountSet),
    })),
    adjustments: adjustmentNodes.map((adjustment) => ({
      amount: shopAmount(adjustment.amountSet),
      tax: shopAmount(adjustment.taxAmountSet),
    })),
    transactions: transactionNodes
      .map(readTransaction)
      .filter((tx): tx is FeeTransaction => tx != null)
      .map((tx) => ({ kind: tx.kind, status: tx.status, fees: tx.fees })),
  };
}

function readOrder(node: JsonObject, children: JsonObject[]): NormalizedOrder | null {
  const orderGid = str(node.id);
  const processedAt = str(node.processedAt);
  if (!orderGid || !processedAt) return null;

  const inlineLines = connectionNodes(node.lineItems);
  const childLines = children.filter((child) => gidKind(str(child.id) ?? "") === "LineItem");
  const inlineShipping = connectionNodes(node.shippingLines);
  const childShipping = children.filter((child) => gidKind(str(child.id) ?? "") === "ShippingLine");
  const inlineTransactions = asArray(node.transactions);
  const childTransactions = children.filter((child) => gidKind(str(child.id) ?? "") === "OrderTransaction");

  const refundNodes = new Map<string, JsonObject>();
  for (const refund of asArray(node.refunds)) {
    const id = str(refund.id);
    if (id) refundNodes.set(id, refund);
  }
  for (const child of children) {
    if (gidKind(str(child.id) ?? "") === "Refund") {
      const id = str(child.id);
      if (id) refundNodes.set(id, { ...refundNodes.get(id), ...child });
    }
  }
  const extrasByParent = new Map<string, JsonObject[]>();
  for (const child of children) {
    const parent = str(child.__parentId);
    if (!parent) continue;
    const list = extrasByParent.get(parent) ?? [];
    list.push(child);
    extrasByParent.set(parent, list);
  }

  const gateways = Array.isArray(node.paymentGatewayNames)
    ? node.paymentGatewayNames.filter((name): name is string => typeof name === "string")
    : [];

  return {
    orderGid,
    name: str(node.name) ?? orderGid,
    processedAt,
    cancelledAt: str(node.cancelledAt),
    test: node.test === true,
    taxesIncluded: node.taxesIncluded === true,
    currencyCode: str(node.currencyCode) ?? "USD",
    presentmentCurrencyCode: str(node.presentmentCurrencyCode) ?? str(node.currencyCode) ?? "USD",
    sourceName: str(node.sourceName),
    updatedAt: str(node.updatedAt) ?? processedAt,
    paymentGatewayNames: gateways,
    totalPrice: shopAmount(node.totalPriceSet),
    totalTax: shopAmount(node.totalTaxSet),
    duties: shopAmount(node.originalTotalDutiesSet),
    additionalFees: shopAmount(node.originalTotalAdditionalFeesSet),
    tips: shopAmount(node.totalTipReceivedSet),
    lines: [...inlineLines, ...childLines].map(readLine).filter((line): line is LineInput => line != null),
    shippingLines: [...inlineShipping, ...childShipping]
      .map(readShipping)
      .filter((line): line is ShippingLineInput => line != null),
    transactions: [...inlineTransactions, ...childTransactions]
      .map(readTransaction)
      .filter((tx): tx is FeeTransaction => tx != null),
    refunds: [...refundNodes.values()]
      .map((refund) => readRefund(refund, extrasByParent.get(str(refund.id) ?? "") ?? []))
      .filter((refund): refund is NonNullable<typeof refund> => refund != null),
  };
}

/** Turn bulk JSONL objects (children carry __parentId) into orders and variants. */
export function assembleBulk(objects: JsonObject[]): {
  orders: NormalizedOrder[];
  variants: NormalizedVariant[];
} {
  const childrenOf = new Map<string, JsonObject[]>();
  const roots: JsonObject[] = [];
  for (const object of objects) {
    const parent = str(object.__parentId);
    if (parent) {
      const list = childrenOf.get(parent) ?? [];
      list.push(object);
      childrenOf.set(parent, list);
    } else {
      roots.push(object);
    }
  }

  const orders: NormalizedOrder[] = [];
  const variants: NormalizedVariant[] = [];
  for (const root of roots) {
    const id = str(root.id);
    if (!id) continue;
    const kind = gidKind(id);
    if (kind === "Order") {
      const order = readOrder(root, childrenOf.get(id) ?? []);
      if (order) orders.push(order);
    } else if (kind === "ProductVariant") {
      const variant = readVariant(root);
      if (variant) variants.push(variant);
    }
  }
  return { orders, variants };
}

export function readVariant(node: JsonObject): NormalizedVariant | null {
  const variantGid = str(node.id);
  if (!variantGid) return null;
  const product = asObject(node.product);
  const inventory = asObject(node.inventoryItem);
  const unit = asObject(inventory?.unitCost);
  return {
    variantGid,
    productGid: str(product?.id) ?? "unknown",
    productTitle: str(product?.title) ?? "Product",
    variantTitle: str(node.title),
    sku: str(node.sku),
    inventoryItemGid: str(inventory?.id),
    shopifyUnitCost: unit && unit.amount != null ? D(String(unit.amount)) : null,
  };
}

export function orderFromGraphql(data: JsonObject): NormalizedOrder | null {
  return readOrder(data, []);
}
