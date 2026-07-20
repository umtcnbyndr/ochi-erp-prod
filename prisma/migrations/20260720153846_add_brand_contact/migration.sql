-- CreateTable
CREATE TABLE "BrandContact" (
    "id" SERIAL NOT NULL,
    "brandId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BrandContact_brandId_idx" ON "BrandContact"("brandId");

-- AddForeignKey
ALTER TABLE "BrandContact" ADD CONSTRAINT "BrandContact_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DataMigration: eski serbest-metin İletişim alanını yeni kişi listesine taşı (veri kaybı olmasın)
INSERT INTO "BrandContact" ("brandId", "name", "createdAt", "updatedAt")
SELECT "id", "contactInfo", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Brand"
WHERE "contactInfo" IS NOT NULL AND trim("contactInfo") != '';

-- AlterTable
ALTER TABLE "Brand" DROP COLUMN "contactInfo";
