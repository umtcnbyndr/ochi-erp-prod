-- CreateEnum
CREATE TYPE "FavoriteReportType" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY', 'CUSTOM');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "lifetimeDemandScore" DECIMAL(8,4),
ADD COLUMN     "lifetimeDemandUpdatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "FavoriteUploadRun" (
    "id" SERIAL NOT NULL,
    "filename" TEXT NOT NULL,
    "reportType" "FavoriteReportType" NOT NULL,
    "reportPeriodStart" TIMESTAMP(3) NOT NULL,
    "reportPeriodEnd" TIMESTAMP(3) NOT NULL,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "matchedCount" INTEGER NOT NULL DEFAULT 0,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedBy" TEXT,

    CONSTRAINT "FavoriteUploadRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrendyolFavoriteSnapshot" (
    "id" SERIAL NOT NULL,
    "productCode" TEXT NOT NULL,
    "productId" INTEGER,
    "reportType" "FavoriteReportType" NOT NULL,
    "reportPeriodStart" TIMESTAMP(3) NOT NULL,
    "reportPeriodEnd" TIMESTAMP(3) NOT NULL,
    "productName" TEXT NOT NULL,
    "brand" TEXT,
    "categoryName" TEXT,
    "imageUrl" TEXT,
    "totalViews" INTEGER NOT NULL DEFAULT 0,
    "grossFavorites" INTEGER NOT NULL DEFAULT 0,
    "activeFavorites" INTEGER NOT NULL DEFAULT 0,
    "sellerViews" INTEGER NOT NULL DEFAULT 0,
    "cartAdds" INTEGER NOT NULL DEFAULT 0,
    "orders" INTEGER NOT NULL DEFAULT 0,
    "conversionRate" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "salesCount" INTEGER NOT NULL DEFAULT 0,
    "grossRevenue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "demandScore" DECIMAL(10,4),
    "uploadId" INTEGER NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawJson" JSONB NOT NULL,

    CONSTRAINT "TrendyolFavoriteSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FavoriteUploadRun_reportPeriodEnd_idx" ON "FavoriteUploadRun"("reportPeriodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "FavoriteUploadRun_reportType_reportPeriodStart_reportPeriod_key" ON "FavoriteUploadRun"("reportType", "reportPeriodStart", "reportPeriodEnd");

-- CreateIndex
CREATE INDEX "TrendyolFavoriteSnapshot_productId_idx" ON "TrendyolFavoriteSnapshot"("productId");

-- CreateIndex
CREATE INDEX "TrendyolFavoriteSnapshot_reportPeriodEnd_idx" ON "TrendyolFavoriteSnapshot"("reportPeriodEnd");

-- CreateIndex
CREATE INDEX "TrendyolFavoriteSnapshot_demandScore_idx" ON "TrendyolFavoriteSnapshot"("demandScore");

-- CreateIndex
CREATE INDEX "TrendyolFavoriteSnapshot_uploadId_idx" ON "TrendyolFavoriteSnapshot"("uploadId");

-- CreateIndex
CREATE UNIQUE INDEX "TrendyolFavoriteSnapshot_productCode_reportType_reportPerio_key" ON "TrendyolFavoriteSnapshot"("productCode", "reportType", "reportPeriodStart", "reportPeriodEnd");

-- AddForeignKey
ALTER TABLE "TrendyolFavoriteSnapshot" ADD CONSTRAINT "TrendyolFavoriteSnapshot_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrendyolFavoriteSnapshot" ADD CONSTRAINT "TrendyolFavoriteSnapshot_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "FavoriteUploadRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
