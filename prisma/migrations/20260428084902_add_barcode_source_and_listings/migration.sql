-- CreateEnum
CREATE TYPE "BarcodeSource" AS ENUM ('MANUAL', 'ERP_PRIMARY', 'TRENDYOL_AUDIT', 'DOPIGO_AUDIT', 'IMPORT');

-- AlterTable
ALTER TABLE "ProductBarcode" ADD COLUMN     "note" TEXT,
ADD COLUMN     "source" "BarcodeSource" NOT NULL DEFAULT 'MANUAL';

-- CreateTable
CREATE TABLE "TrendyolListing" (
    "id" SERIAL NOT NULL,
    "barcode" TEXT NOT NULL,
    "productCode" TEXT,
    "title" TEXT NOT NULL,
    "brand" TEXT,
    "categoryName" TEXT,
    "listPrice" DECIMAL(12,2),
    "salePrice" DECIMAL(12,2),
    "quantity" INTEGER,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "rejected" BOOLEAN NOT NULL DEFAULT false,
    "onSale" BOOLEAN NOT NULL DEFAULT false,
    "rawJson" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrendyolListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrendyolSyncRun" (
    "id" SERIAL NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "totalFetched" INTEGER NOT NULL DEFAULT 0,
    "totalPages" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "errorMessage" TEXT,

    CONSTRAINT "TrendyolSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DopigoListing" (
    "id" SERIAL NOT NULL,
    "barcode" TEXT,
    "sku" TEXT,
    "merchantSku" TEXT,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "rawRowJson" JSONB NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DopigoListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DopigoSyncRun" (
    "id" SERIAL NOT NULL,
    "filename" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DopigoSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrendyolListing_barcode_key" ON "TrendyolListing"("barcode");

-- CreateIndex
CREATE INDEX "TrendyolListing_approved_idx" ON "TrendyolListing"("approved");

-- CreateIndex
CREATE INDEX "TrendyolListing_fetchedAt_idx" ON "TrendyolListing"("fetchedAt");

-- CreateIndex
CREATE INDEX "DopigoListing_barcode_idx" ON "DopigoListing"("barcode");

-- CreateIndex
CREATE INDEX "DopigoListing_merchantSku_idx" ON "DopigoListing"("merchantSku");

-- CreateIndex
CREATE INDEX "ProductBarcode_source_idx" ON "ProductBarcode"("source");
