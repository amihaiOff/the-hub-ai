-- AlterTable
ALTER TABLE "household_members" ADD COLUMN     "allowed_sections" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "household_invites" ADD COLUMN     "allowed_sections" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Backfill: give every owner-less stock account its creator's profile as owner,
-- so ownership-based checks (owners route, snapshot cron) see legacy accounts.
INSERT INTO "stock_account_owners" ("id", "account_id", "profile_id")
SELECT 'bf' || md5(sa."id" || p."id"), sa."id", p."id"
FROM "stock_accounts" sa
JOIN "profiles" p ON p."user_id" = sa."user_id"
WHERE NOT EXISTS (
  SELECT 1 FROM "stock_account_owners" o WHERE o."account_id" = sa."id"
);
