/**
 * Admin GraphQL operations for API version 2026-10.
 *
 * Checked against shopify.dev object docs on 2026-10-18 unless a comment says otherwise.
 * Selections use shopMoney only.
 *
 * Still needs a dev-store bulk run:
 * - bulkOperationRunQuery may reject Order.transactions because that list accepts arguments.
 * - bulkOperationRunQuery may reject connections nested under the Refund list
 *   (refundLineItems, refundShippingLines, orderAdjustments, transactions).
 * bulk.server.ts retries without transactions, and falls back to per-order reads, when that happens.
 */

export const SHOP_BOOTSTRAP = `#graphql
  query ShopBootstrap {
    shop {
      id
      currencyCode
      ianaTimezone
      myshopifyDomain
    }
    currentAppInstallation {
      accessScopes {
        handle
      }
      activeSubscriptions {
        id
        name
        status
        test
        currentPeriodEnd
      }
    }
  }
`;

export const BULK_RUN = `#graphql
  mutation BulkRun($q: String!) {
    bulkOperationRunQuery(groupObjects: false, query: $q) {
      bulkOperation {
        id
        status
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const ORDER_SCALAR_SELECTION = `
  id
  name
  processedAt
  cancelledAt
  test
  taxesIncluded
  currencyCode
  presentmentCurrencyCode
  sourceName
  updatedAt
  paymentGatewayNames
  totalPriceSet { shopMoney { amount currencyCode } }
  totalTaxSet { shopMoney { amount } }
  originalTotalDutiesSet { shopMoney { amount } }
  originalTotalAdditionalFeesSet { shopMoney { amount } }
  totalTipReceivedSet { shopMoney { amount } }
`;

// TODO(dev-store): confirm TransactionFee.amount is MoneyV2 in GraphiQL.
// flatFee and taxAmount are omitted. Their sub-selection types were not confirmed,
// and the fee formula sums amount only.
const TRANSACTION_SELECTION = `
  transactions {
    id
    kind
    status
    gateway
    processedAt
    test
    amountSet { shopMoney { amount currencyCode } }
    fees { amount { amount currencyCode } type rate }
  }
`;

const LINE_NODE = `
  id
  title
  sku
  quantity
  isGiftCard
  requiresShipping
  variant { id product { id } }
  originalTotalSet { shopMoney { amount } }
  totalDiscountSet { shopMoney { amount } }
  taxLines { priceSet { shopMoney { amount } } rate }
`;

const SHIPPING_NODE = `
  id
  isRemoved
  discountedPriceSet { shopMoney { amount } }
  taxLines { priceSet { shopMoney { amount } } }
`;

// TODO(dev-store): on a tax-inclusive order, confirm RefundLineItem.subtotalSet is
// exclusive of tax. orderAdjustments.amountSet is summed with the sign Shopify returns.
const REFUND_BODY_EDGES = `
  id
  processedAt
  totalRefundedSet { shopMoney { amount } }
  refundLineItems(first: 250) {
    edges {
      node {
        id
        quantity
        restocked
        lineItem { id variant { id } }
        subtotalSet { shopMoney { amount } }
        totalTaxSet { shopMoney { amount } }
      }
    }
  }
  refundShippingLines(first: 50) {
    edges {
      node {
        id
        subtotalAmountSet { shopMoney { amount } }
        taxAmountSet { shopMoney { amount } }
      }
    }
  }
  orderAdjustments(first: 50) {
    edges {
      node {
        id
        amountSet { shopMoney { amount } }
        taxAmountSet { shopMoney { amount } }
      }
    }
  }
  transactions(first: 20) {
    edges {
      node {
        id
        kind
        status
        fees { amount { amount currencyCode } }
      }
    }
  }
`;

const REFUND_BODY_NODES = `
  id
  processedAt
  totalRefundedSet { shopMoney { amount } }
  refundLineItems(first: 250) {
    nodes {
      id
      quantity
      restocked
      lineItem { id variant { id } }
      subtotalSet { shopMoney { amount } }
      totalTaxSet { shopMoney { amount } }
    }
  }
  refundShippingLines(first: 50) {
    nodes {
      id
      subtotalAmountSet { shopMoney { amount } }
      taxAmountSet { shopMoney { amount } }
    }
  }
  orderAdjustments(first: 50) {
    nodes {
      id
      amountSet { shopMoney { amount } }
      taxAmountSet { shopMoney { amount } }
    }
  }
  transactions(first: 20) {
    nodes {
      id
      kind
      status
      fees { amount { amount currencyCode } }
    }
  }
`;

/**
 * VERIFIED-ADJUSTED: ShippingLineConnection.includeRemovals defaults to false,
 * which would hide removed lines. Pass true and skip isRemoved in the calculator.
 */
export function ordersBulkInner(processedSince: string, includeTransactions = true): string {
  return `{
    orders(query: "processed_at:>=${processedSince}") {
      edges {
        node {
          ${ORDER_SCALAR_SELECTION}
          ${includeTransactions ? TRANSACTION_SELECTION : ""}
          lineItems {
            edges { node { ${LINE_NODE} } }
          }
          shippingLines(includeRemovals: true) {
            edges { node { ${SHIPPING_NODE} } }
          }
        }
      }
    }
  }`;
}

export function refundsBulkInner(processedSince: string): string {
  return `{
    orders(query: "processed_at:>=${processedSince} AND (financial_status:partially_refunded OR financial_status:refunded)") {
      edges {
        node {
          id
          refunds {
            ${REFUND_BODY_EDGES}
          }
        }
      }
    }
  }`;
}

export const ORDER_FOR_PROFIT = `#graphql
  query OrderForProfit($id: ID!) {
    order(id: $id) {
      ${ORDER_SCALAR_SELECTION}
      ${TRANSACTION_SELECTION}
      lineItems(first: 250) {
        nodes { ${LINE_NODE} }
      }
      shippingLines(first: 50, includeRemovals: true) {
        nodes { ${SHIPPING_NODE} }
      }
      refunds {
        ${REFUND_BODY_NODES}
      }
    }
  }
`;

export const ORDERS_UPDATED_SINCE = `#graphql
  query OrdersUpdatedSince($q: String!, $after: String) {
    orders(first: 100, after: $after, query: $q, sortKey: UPDATED_AT) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        updatedAt
      }
    }
  }
`;

export const REFUNDED_ORDERS_PAGE = `#graphql
  query RefundedOrdersPage($q: String!, $after: String) {
    orders(first: 50, after: $after, query: $q) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
      }
    }
  }
`;

/** Catalog bulk. The productVariants root connection was not executed against a store. */
export function variantsBulkInner(): string {
  return `{
    productVariants {
      edges {
        node {
          id
          title
          sku
          product { id title }
          inventoryItem { id unitCost { amount currencyCode } }
        }
      }
    }
  }`;
}

/**
 * VERIFIED-ADJUSTED: InventoryItem.variant is deprecated in 2026-10.
 * The supported field is the variants connection.
 */
export const INVENTORY_ITEM_COST = `#graphql
  query InventoryItemCost($id: ID!) {
    inventoryItem(id: $id) {
      id
      unitCost { amount currencyCode }
      variants(first: 5) {
        nodes { id }
      }
    }
  }
`;

export const PRODUCT_FOR_CATALOG = `#graphql
  query ProductForCatalog($id: ID!) {
    product(id: $id) {
      id
      title
      variants(first: 250) {
        nodes {
          id
          title
          sku
          product { id title }
          inventoryItem { id unitCost { amount currencyCode } }
        }
      }
    }
  }
`;

export const BULK_STATUS = `#graphql
  query BulkOp($id: ID!) {
    node(id: $id) {
      ... on BulkOperation {
        id
        status
        errorCode
        objectCount
        url
        partialDataUrl
      }
    }
  }
`;

export const APP_SUBSCRIPTION_CREATE = `#graphql
  mutation CreateSub($name: String!, $price: Decimal!, $returnUrl: URL!, $test: Boolean, $trialDays: Int) {
    appSubscriptionCreate(
      name: $name
      returnUrl: $returnUrl
      test: $test
      trialDays: $trialDays
      replacementBehavior: APPLY_IMMEDIATELY
      lineItems: [
        {
          plan: {
            appRecurringPricingDetails: {
              price: { amount: $price, currencyCode: USD }
              interval: EVERY_30_DAYS
            }
          }
        }
      ]
    ) {
      appSubscription {
        id
        status
      }
      confirmationUrl
      userErrors {
        field
        message
      }
    }
  }
`;
