-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'SALES';

-- CreateTable
CREATE TABLE "UserAllowedBrand" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "brandId" INTEGER NOT NULL,

    CONSTRAINT "UserAllowedBrand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserAllowedBrand_userId_idx" ON "UserAllowedBrand"("userId");

-- CreateIndex
CREATE INDEX "UserAllowedBrand_brandId_idx" ON "UserAllowedBrand"("brandId");

-- CreateIndex
CREATE UNIQUE INDEX "UserAllowedBrand_userId_brandId_key" ON "UserAllowedBrand"("userId", "brandId");

-- AddForeignKey
ALTER TABLE "UserAllowedBrand" ADD CONSTRAINT "UserAllowedBrand_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAllowedBrand" ADD CONSTRAINT "UserAllowedBrand_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
