-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('income', 'expense');

-- CreateEnum
CREATE TYPE "TransactionSource" AS ENUM ('manual', 'bank_import', 'credit_card_import');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('cash', 'credit_card', 'bank_transfer', 'check', 'other');

-- CreateTable
CREATE TABLE "budget_category_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "household_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_category_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "budget" DECIMAL(18,2),
    "is_must" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "household_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_payees" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category_id" TEXT,
    "household_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_payees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#3B82F6',
    "household_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_transactions" (
    "id" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "transaction_date" DATE NOT NULL,
    "payment_date" DATE,
    "amount_ils" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ILS',
    "amount_original" DECIMAL(18,2) NOT NULL,
    "category_id" TEXT,
    "payee_id" TEXT,
    "payment_method" "PaymentMethod" NOT NULL DEFAULT 'credit_card',
    "payment_number" INTEGER,
    "total_payments" INTEGER,
    "notes" TEXT,
    "source" "TransactionSource" NOT NULL DEFAULT 'manual',
    "is_recurring" BOOLEAN NOT NULL DEFAULT false,
    "is_split" BOOLEAN NOT NULL DEFAULT false,
    "original_transaction_id" TEXT,
    "profile_id" TEXT,
    "household_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_transaction_tags" (
    "id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,

    CONSTRAINT "budget_transaction_tags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "budget_category_groups_household_id_idx" ON "budget_category_groups"("household_id");

-- CreateIndex
CREATE UNIQUE INDEX "budget_category_groups_household_id_name_key" ON "budget_category_groups"("household_id", "name");

-- CreateIndex
CREATE INDEX "budget_categories_household_id_idx" ON "budget_categories"("household_id");

-- CreateIndex
CREATE INDEX "budget_categories_group_id_idx" ON "budget_categories"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "budget_categories_group_id_name_key" ON "budget_categories"("group_id", "name");

-- CreateIndex
CREATE INDEX "budget_payees_household_id_idx" ON "budget_payees"("household_id");

-- CreateIndex
CREATE INDEX "budget_payees_category_id_idx" ON "budget_payees"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "budget_payees_household_id_name_key" ON "budget_payees"("household_id", "name");

-- CreateIndex
CREATE INDEX "budget_tags_household_id_idx" ON "budget_tags"("household_id");

-- CreateIndex
CREATE UNIQUE INDEX "budget_tags_household_id_name_key" ON "budget_tags"("household_id", "name");

-- CreateIndex
CREATE INDEX "budget_transactions_household_id_idx" ON "budget_transactions"("household_id");

-- CreateIndex
CREATE INDEX "budget_transactions_transaction_date_idx" ON "budget_transactions"("transaction_date");

-- CreateIndex
CREATE INDEX "budget_transactions_category_id_idx" ON "budget_transactions"("category_id");

-- CreateIndex
CREATE INDEX "budget_transactions_payee_id_idx" ON "budget_transactions"("payee_id");

-- CreateIndex
CREATE INDEX "budget_transactions_profile_id_idx" ON "budget_transactions"("profile_id");

-- CreateIndex
CREATE INDEX "budget_transactions_original_transaction_id_idx" ON "budget_transactions"("original_transaction_id");

-- CreateIndex
CREATE INDEX "budget_transaction_tags_transaction_id_idx" ON "budget_transaction_tags"("transaction_id");

-- CreateIndex
CREATE INDEX "budget_transaction_tags_tag_id_idx" ON "budget_transaction_tags"("tag_id");

-- CreateIndex
CREATE UNIQUE INDEX "budget_transaction_tags_transaction_id_tag_id_key" ON "budget_transaction_tags"("transaction_id", "tag_id");

-- AddForeignKey
ALTER TABLE "budget_category_groups" ADD CONSTRAINT "budget_category_groups_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_categories" ADD CONSTRAINT "budget_categories_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "budget_category_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_payees" ADD CONSTRAINT "budget_payees_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "budget_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_transactions" ADD CONSTRAINT "budget_transactions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "budget_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_transactions" ADD CONSTRAINT "budget_transactions_payee_id_fkey" FOREIGN KEY ("payee_id") REFERENCES "budget_payees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_transactions" ADD CONSTRAINT "budget_transactions_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_transactions" ADD CONSTRAINT "budget_transactions_original_transaction_id_fkey" FOREIGN KEY ("original_transaction_id") REFERENCES "budget_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_transaction_tags" ADD CONSTRAINT "budget_transaction_tags_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "budget_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_transaction_tags" ADD CONSTRAINT "budget_transaction_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "budget_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
