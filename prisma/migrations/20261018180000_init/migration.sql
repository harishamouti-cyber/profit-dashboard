-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('NONE', 'STARTER', 'GROWTH', 'PRO');

-- CreateEnum
CREATE TYPE "FeeMode" AS ENUM ('ACTUAL_THEN_RULE', 'RULE_ONLY');

-- CreateEnum
CREATE TYPE "ShippingCostMode" AS ENUM ('NONE', 'FLAT_PER_ORDER', 'PERCENT_OF_SHIPPING_CHARGED', 'PER_ORDER_MANUAL');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('IDLE', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "SyncKind" AS ENUM ('ORDERS_BACKFILL', 'REFUNDS_BACKFILL', 'COSTS_BACKFILL', 'INCREMENTAL', 'REBUILD_METRICS');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "ExpenseFrequency" AS ENUM ('ONE_TIME', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY');

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "shopGid" TEXT,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "ianaTimezone" TEXT NOT NULL DEFAULT 'UTC',
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uninstalledAt" TIMESTAMP(3),
    "plan" "Plan" NOT NULL DEFAULT 'NONE',
    "planSyncedAt" TIMESTAMP(3),
    "feeMode" "FeeMode" NOT NULL DEFAULT 'ACTUAL_THEN_RULE',
    "shippingCostMode" "ShippingCostMode" NOT NULL DEFAULT 'NONE',
    "shippingFlatCost" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "shippingPercent" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "includeTestOrders" BOOLEAN NOT NULL DEFAULT false,
    "excludeCancelled" BOOLEAN NOT NULL DEFAULT true,
    "historyDays" INTEGER NOT NULL DEFAULT 60,
    "onboardingDone" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Variant" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "variantGid" TEXT NOT NULL,
    "productGid" TEXT NOT NULL,
    "inventoryItemGid" TEXT,
    "productTitle" TEXT NOT NULL,
    "variantTitle" TEXT,
    "sku" TEXT,
    "shopifyUnitCost" DECIMAL(14,4),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Variant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VariantCost" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "variantGid" TEXT NOT NULL,
    "unitCost" DECIMAL(14,4) NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "source" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VariantCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "orderGid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL,
    "localDate" DATE NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "test" BOOLEAN NOT NULL DEFAULT false,
    "taxesIncluded" BOOLEAN NOT NULL,
    "requiresShipping" BOOLEAN NOT NULL DEFAULT false,
    "currencyCode" TEXT NOT NULL,
    "presentmentCurrency" TEXT NOT NULL,
    "sourceName" TEXT,
    "grossLineSales" DECIMAL(14,4) NOT NULL,
    "lineDiscounts" DECIMAL(14,4) NOT NULL,
    "lineTax" DECIMAL(14,4) NOT NULL,
    "shippingCharged" DECIMAL(14,4) NOT NULL,
    "shippingTax" DECIMAL(14,4) NOT NULL,
    "totalTax" DECIMAL(14,4) NOT NULL,
    "totalPrice" DECIMAL(14,4) NOT NULL,
    "dutiesAndFees" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "tips" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "paymentFees" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "feesAreActual" BOOLEAN NOT NULL DEFAULT false,
    "gateways" TEXT[],
    "shippingCost" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "shopifyUpdatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "lineItemGid" TEXT NOT NULL,
    "variantGid" TEXT,
    "productGid" TEXT,
    "title" TEXT NOT NULL,
    "sku" TEXT,
    "quantity" INTEGER NOT NULL,
    "isGiftCard" BOOLEAN NOT NULL DEFAULT false,
    "originalTotal" DECIMAL(14,4) NOT NULL,
    "discountTotal" DECIMAL(14,4) NOT NULL,
    "taxTotal" DECIMAL(14,4) NOT NULL,
    "netSalesExTax" DECIMAL(14,4) NOT NULL,
    "unitCostUsed" DECIMAL(14,4),
    "cogs" DECIMAL(14,4) NOT NULL DEFAULT 0,

    CONSTRAINT "OrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "refundGid" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL,
    "localDate" DATE NOT NULL,
    "totalRefunded" DECIMAL(14,4) NOT NULL,
    "lineSubtotal" DECIMAL(14,4) NOT NULL,
    "lineTax" DECIMAL(14,4) NOT NULL,
    "shippingSubtotal" DECIMAL(14,4) NOT NULL,
    "shippingTax" DECIMAL(14,4) NOT NULL,
    "adjustments" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "adjustmentsTax" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "restockedCogs" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "refundedFees" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefundLine" (
    "id" TEXT NOT NULL,
    "refundId" TEXT NOT NULL,
    "lineItemGid" TEXT NOT NULL,
    "variantGid" TEXT,
    "quantity" INTEGER NOT NULL,
    "restocked" BOOLEAN NOT NULL,
    "subtotal" DECIMAL(14,4) NOT NULL,
    "tax" DECIMAL(14,4) NOT NULL,

    CONSTRAINT "RefundLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShippingCost" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "orderName" TEXT NOT NULL,
    "amount" DECIMAL(14,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShippingCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GatewayFeeRule" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "gateway" TEXT NOT NULL,
    "percent" DECIMAL(7,4) NOT NULL,
    "fixed" DECIMAL(14,4) NOT NULL,

    CONSTRAINT "GatewayFeeRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdSpend" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "channel" TEXT NOT NULL,
    "amount" DECIMAL(14,4) NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdSpend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'other',
    "amount" DECIMAL(14,4) NOT NULL,
    "frequency" "ExpenseFrequency" NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyMetric" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "orders" INTEGER NOT NULL DEFAULT 0,
    "grossSales" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "discounts" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "returns" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "netSales" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "shippingRevenue" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "taxCollected" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "revenue" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "cogs" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "shippingCost" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "paymentFees" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "adSpend" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "expenses" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "grossProfit" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "contribution" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "netProfit" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "missingCostUnits" INTEGER NOT NULL DEFAULT 0,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductDailyMetric" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "productGid" TEXT NOT NULL,
    "unitsSold" INTEGER NOT NULL DEFAULT 0,
    "unitsReturned" INTEGER NOT NULL DEFAULT 0,
    "netSales" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "cogs" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "allocatedFees" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "grossProfit" DECIMAL(14,4) NOT NULL DEFAULT 0,

    CONSTRAINT "ProductDailyMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "subscriptionGid" TEXT,
    "plan" "Plan" NOT NULL DEFAULT 'NONE',
    "status" TEXT NOT NULL,
    "test" BOOLEAN NOT NULL DEFAULT false,
    "trialDays" INTEGER NOT NULL DEFAULT 0,
    "currentPeriodEnd" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncJob" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "kind" "SyncKind" NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'IDLE',
    "bulkOperationGid" TEXT,
    "cursorUpdatedAt" TIMESTAMP(3),
    "objectCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessedWebhook" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedWebhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Shop_shopDomain_key" ON "Shop"("shopDomain");

-- CreateIndex
CREATE INDEX "Variant_shopId_sku_idx" ON "Variant"("shopId", "sku");

-- CreateIndex
CREATE INDEX "Variant_shopId_inventoryItemGid_idx" ON "Variant"("shopId", "inventoryItemGid");

-- CreateIndex
CREATE UNIQUE INDEX "Variant_shopId_variantGid_key" ON "Variant"("shopId", "variantGid");

-- CreateIndex
CREATE INDEX "VariantCost_shopId_variantGid_effectiveFrom_idx" ON "VariantCost"("shopId", "variantGid", "effectiveFrom");

-- CreateIndex
CREATE INDEX "Order_shopId_localDate_idx" ON "Order"("shopId", "localDate");

-- CreateIndex
CREATE UNIQUE INDEX "Order_shopId_orderGid_key" ON "Order"("shopId", "orderGid");

-- CreateIndex
CREATE INDEX "OrderLine_variantGid_idx" ON "OrderLine"("variantGid");

-- CreateIndex
CREATE UNIQUE INDEX "OrderLine_orderId_lineItemGid_key" ON "OrderLine"("orderId", "lineItemGid");

-- CreateIndex
CREATE INDEX "Refund_shopId_localDate_idx" ON "Refund"("shopId", "localDate");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_shopId_refundGid_key" ON "Refund"("shopId", "refundGid");

-- CreateIndex
CREATE UNIQUE INDEX "ShippingCost_shopId_orderName_key" ON "ShippingCost"("shopId", "orderName");

-- CreateIndex
CREATE UNIQUE INDEX "GatewayFeeRule_shopId_gateway_key" ON "GatewayFeeRule"("shopId", "gateway");

-- CreateIndex
CREATE INDEX "AdSpend_shopId_date_idx" ON "AdSpend"("shopId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AdSpend_shopId_date_channel_key" ON "AdSpend"("shopId", "date", "channel");

-- CreateIndex
CREATE INDEX "Expense_shopId_idx" ON "Expense"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyMetric_shopId_date_key" ON "DailyMetric"("shopId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ProductDailyMetric_shopId_date_productGid_key" ON "ProductDailyMetric"("shopId", "date", "productGid");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_shopId_key" ON "Subscription"("shopId");

-- CreateIndex
CREATE INDEX "SyncJob_shopId_kind_createdAt_idx" ON "SyncJob"("shopId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "ProcessedWebhook_shopDomain_receivedAt_idx" ON "ProcessedWebhook"("shopDomain", "receivedAt");

-- CreateIndex
CREATE INDEX "Job_status_runAt_idx" ON "Job"("status", "runAt");

-- CreateIndex
CREATE INDEX "Job_shopDomain_type_idx" ON "Job"("shopDomain", "type");

-- AddForeignKey
ALTER TABLE "Variant" ADD CONSTRAINT "Variant_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantCost" ADD CONSTRAINT "VariantCost_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundLine" ADD CONSTRAINT "RefundLine_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "Refund"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShippingCost" ADD CONSTRAINT "ShippingCost_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GatewayFeeRule" ADD CONSTRAINT "GatewayFeeRule_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdSpend" ADD CONSTRAINT "AdSpend_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyMetric" ADD CONSTRAINT "DailyMetric_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductDailyMetric" ADD CONSTRAINT "ProductDailyMetric_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncJob" ADD CONSTRAINT "SyncJob_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

