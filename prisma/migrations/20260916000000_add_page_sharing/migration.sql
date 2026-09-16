-- CreateEnum
CREATE TYPE "PageShareAccess" AS ENUM ('view', 'edit');

-- AlterTable
ALTER TABLE "pages" ADD COLUMN     "share_access" "PageShareAccess",
ADD COLUMN     "share_token" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "pages_share_token_key" ON "pages"("share_token");
