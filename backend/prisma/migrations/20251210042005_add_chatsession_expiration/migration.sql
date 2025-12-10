-- AlterTable
ALTER TABLE "ChatSession" ADD COLUMN     "expiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "visibility" SET DEFAULT true;

-- CreateIndex
CREATE INDEX "ChatSession_expiresAt_idx" ON "ChatSession"("expiresAt");
