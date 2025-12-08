-- DropIndex
DROP INDEX "UserLocation_userId_idx";

-- CreateIndex
CREATE INDEX "UserLocation_userId_updatedAt_idx" ON "UserLocation"("userId", "updatedAt" DESC);
