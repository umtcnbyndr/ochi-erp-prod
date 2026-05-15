-- CreateTable
CREATE TABLE "CampaignPayment" (
    "id" SERIAL NOT NULL,
    "campaignId" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "invoiceNo" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampaignPayment_campaignId_paymentDate_idx" ON "CampaignPayment"("campaignId", "paymentDate");

-- AddForeignKey
ALTER TABLE "CampaignPayment" ADD CONSTRAINT "CampaignPayment_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
