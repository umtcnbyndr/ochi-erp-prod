-- CreateTable
CREATE TABLE "MonthlySalesSnapshot" (
    "id" SERIAL NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "revenue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "commission" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "shipping" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "withholding" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "isManual" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "MonthlySalesSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MonthlySalesSnapshot_year_idx" ON "MonthlySalesSnapshot"("year");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlySalesSnapshot_year_month_key" ON "MonthlySalesSnapshot"("year", "month");
