-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('RENT', 'SALARY', 'BONUS', 'ELECTRICITY', 'GAS', 'WATER', 'INTERNET', 'OFFICE', 'INTEGRATION', 'BOX', 'NYLON', 'LABEL', 'TAPE', 'CREDIT', 'ACCOUNTING', 'ADVERTISING', 'TAX', 'OTHER');

-- CreateEnum
CREATE TYPE "ExpensePeriodicity" AS ENUM ('ONE_TIME', 'MONTHLY', 'QUARTERLY', 'YEARLY');

-- CreateTable
CREATE TABLE "Expense" (
    "id" SERIAL NOT NULL,
    "expenseDate" TIMESTAMP(3) NOT NULL,
    "period" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "customCategory" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "periodicity" "ExpensePeriodicity" NOT NULL DEFAULT 'ONE_TIME',
    "description" TEXT,
    "vendor" TEXT,
    "invoiceNumber" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Expense_period_idx" ON "Expense"("period");

-- CreateIndex
CREATE INDEX "Expense_category_idx" ON "Expense"("category");

-- CreateIndex
CREATE INDEX "Expense_expenseDate_idx" ON "Expense"("expenseDate");
