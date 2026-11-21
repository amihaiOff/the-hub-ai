-- AlterTable
ALTER TABLE "household_members" ADD COLUMN     "allowed_sections" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "household_invites" ADD COLUMN     "allowed_sections" TEXT[] DEFAULT ARRAY[]::TEXT[];
