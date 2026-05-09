-- CreateTable
CREATE TABLE "DopigoConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "pharmacyId" INTEGER NOT NULL DEFAULT 1,
    "apiToken" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL DEFAULT 'https://panel.dopigo.com',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastTestedAt" TIMESTAMP(3),
    "lastTestOk" BOOLEAN,
    "lastTestNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DopigoConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DopigoOrder" (
    "id" SERIAL NOT NULL,
    "dopigoOrderId" BIGINT NOT NULL,
    "serviceName" TEXT NOT NULL,
    "salesChannel" TEXT NOT NULL,
    "serviceOrderId" TEXT,
    "serviceValue" TEXT,
    "marketplaceId" INTEGER,
    "serviceCreatedAt" TIMESTAMP(3) NOT NULL,
    "shippedAt" TIMESTAMP(3),
    "total" DECIMAL(12,2) NOT NULL,
    "serviceFee" DECIMAL(12,2),
    "discount" DECIMAL(12,2),
    "paymentType" TEXT,
    "status" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "customerName" TEXT,
    "customerCity" TEXT,
    "customerDistrict" TEXT,
    "customerEmail" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawJson" JSONB NOT NULL,

    CONSTRAINT "DopigoOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DopigoOrderItem" (
    "id" SERIAL NOT NULL,
    "dopigoItemId" BIGINT NOT NULL,
    "orderId" INTEGER NOT NULL,
    "serviceItemId" TEXT,
    "serviceProductId" TEXT,
    "sku" TEXT,
    "foreignSku" TEXT,
    "barcode" TEXT,
    "productName" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "unitPrice" DECIMAL(12,2),
    "taxRatio" INTEGER,
    "itemStatus" TEXT,
    "productId" INTEGER,
    "matchMethod" TEXT,
    "matchedAt" TIMESTAMP(3),
    "productType" TEXT,

    CONSTRAINT "DopigoOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DopigoOrderSyncRun" (
    "id" SERIAL NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "rangeFrom" TIMESTAMP(3),
    "rangeTo" TIMESTAMP(3),
    "totalFetched" INTEGER NOT NULL DEFAULT 0,
    "totalCreated" INTEGER NOT NULL DEFAULT 0,
    "totalUpdated" INTEGER NOT NULL DEFAULT 0,
    "totalMatched" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "errorMessage" TEXT,
    "triggeredBy" TEXT,

    CONSTRAINT "DopigoOrderSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceMonthlyExpense" (
    "id" SERIAL NOT NULL,
    "marketplaceId" INTEGER NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "commissionPaid" DECIMAL(12,2),
    "shippingPaid" DECIMAL(12,2),
    "withholdingPaid" DECIMAL(12,2),
    "returnCosts" DECIMAL(12,2),
    "adSpend" DECIMAL(12,2),
    "otherExpenses" DECIMAL(12,2),
    "notes" TEXT,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "enteredBy" TEXT,

    CONSTRAINT "MarketplaceMonthlyExpense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DopigoOrder_dopigoOrderId_key" ON "DopigoOrder"("dopigoOrderId");

-- CreateIndex
CREATE INDEX "DopigoOrder_serviceCreatedAt_idx" ON "DopigoOrder"("serviceCreatedAt");

-- CreateIndex
CREATE INDEX "DopigoOrder_salesChannel_serviceCreatedAt_idx" ON "DopigoOrder"("salesChannel", "serviceCreatedAt");

-- CreateIndex
CREATE INDEX "DopigoOrder_status_idx" ON "DopigoOrder"("status");

-- CreateIndex
CREATE INDEX "DopigoOrder_marketplaceId_idx" ON "DopigoOrder"("marketplaceId");

-- CreateIndex
CREATE UNIQUE INDEX "DopigoOrderItem_dopigoItemId_key" ON "DopigoOrderItem"("dopigoItemId");

-- CreateIndex
CREATE INDEX "DopigoOrderItem_orderId_idx" ON "DopigoOrderItem"("orderId");

-- CreateIndex
CREATE INDEX "DopigoOrderItem_productId_idx" ON "DopigoOrderItem"("productId");

-- CreateIndex
CREATE INDEX "DopigoOrderItem_barcode_idx" ON "DopigoOrderItem"("barcode");

-- CreateIndex
CREATE INDEX "DopigoOrderItem_foreignSku_idx" ON "DopigoOrderItem"("foreignSku");

-- CreateIndex
CREATE INDEX "DopigoOrderItem_matchMethod_idx" ON "DopigoOrderItem"("matchMethod");

-- CreateIndex
CREATE INDEX "MarketplaceMonthlyExpense_month_idx" ON "MarketplaceMonthlyExpense"("month");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceMonthlyExpense_marketplaceId_month_key" ON "MarketplaceMonthlyExpense"("marketplaceId", "month");

-- AddForeignKey
ALTER TABLE "DopigoOrder" ADD CONSTRAINT "DopigoOrder_marketplaceId_fkey" FOREIGN KEY ("marketplaceId") REFERENCES "Marketplace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DopigoOrderItem" ADD CONSTRAINT "DopigoOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "DopigoOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DopigoOrderItem" ADD CONSTRAINT "DopigoOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceMonthlyExpense" ADD CONSTRAINT "MarketplaceMonthlyExpense_marketplaceId_fkey" FOREIGN KEY ("marketplaceId") REFERENCES "Marketplace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
