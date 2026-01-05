-- CreateEnum
CREATE TYPE "HouseholdRole" AS ENUM ('owner', 'admin', 'member');

-- DropForeignKey
ALTER TABLE "misc_assets" DROP CONSTRAINT "misc_assets_user_id_fkey";

-- DropForeignKey
ALTER TABLE "pension_accounts" DROP CONSTRAINT "pension_accounts_user_id_fkey";

-- DropForeignKey
ALTER TABLE "stock_accounts" DROP CONSTRAINT "stock_accounts_user_id_fkey";

-- AlterTable
ALTER TABLE "misc_assets" ALTER COLUMN "user_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "pension_accounts" ALTER COLUMN "user_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "stock_accounts" ALTER COLUMN "user_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "profiles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "image" TEXT,
    "color" TEXT DEFAULT '#3b82f6',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "households" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "households_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "household_members" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "role" "HouseholdRole" NOT NULL DEFAULT 'member',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "household_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_account_owners" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,

    CONSTRAINT "stock_account_owners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pension_account_owners" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,

    CONSTRAINT "pension_account_owners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "misc_asset_owners" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,

    CONSTRAINT "misc_asset_owners_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "profiles_user_id_key" ON "profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "household_members_household_id_profile_id_key" ON "household_members"("household_id", "profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_account_owners_account_id_profile_id_key" ON "stock_account_owners"("account_id", "profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "pension_account_owners_account_id_profile_id_key" ON "pension_account_owners"("account_id", "profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "misc_asset_owners_asset_id_profile_id_key" ON "misc_asset_owners"("asset_id", "profile_id");

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_account_owners" ADD CONSTRAINT "stock_account_owners_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "stock_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_account_owners" ADD CONSTRAINT "stock_account_owners_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pension_account_owners" ADD CONSTRAINT "pension_account_owners_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "pension_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pension_account_owners" ADD CONSTRAINT "pension_account_owners_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "misc_asset_owners" ADD CONSTRAINT "misc_asset_owners_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "misc_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "misc_asset_owners" ADD CONSTRAINT "misc_asset_owners_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_accounts" ADD CONSTRAINT "stock_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pension_accounts" ADD CONSTRAINT "pension_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "misc_assets" ADD CONSTRAINT "misc_assets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
