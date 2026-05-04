-- AlterTable
ALTER TABLE "Brand" ADD COLUMN     "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Subcategory" ADD COLUMN     "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[];
