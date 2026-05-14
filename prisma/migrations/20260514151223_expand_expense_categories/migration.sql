-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ExpenseCategory" ADD VALUE 'MEAL';
ALTER TYPE "ExpenseCategory" ADD VALUE 'INSURANCE';
ALTER TYPE "ExpenseCategory" ADD VALUE 'BUILDING_FEE';
ALTER TYPE "ExpenseCategory" ADD VALUE 'CLEANING';
ALTER TYPE "ExpenseCategory" ADD VALUE 'SOFTWARE';
ALTER TYPE "ExpenseCategory" ADD VALUE 'HOSTING';
ALTER TYPE "ExpenseCategory" ADD VALUE 'DOMAIN';
ALTER TYPE "ExpenseCategory" ADD VALUE 'DOPIGO';
ALTER TYPE "ExpenseCategory" ADD VALUE 'SMS';
ALTER TYPE "ExpenseCategory" ADD VALUE 'CONTENT';
ALTER TYPE "ExpenseCategory" ADD VALUE 'BANK_FEE';
