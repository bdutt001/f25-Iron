/*
  Warnings:

  - A unique constraint covering the columns `[phoneNumber]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[googleId]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[appleId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('NEEDS_REVIEW', 'UNDER_REVIEW', 'RESOLVED_ACTION', 'RESOLVED_NO_ACTION');

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "lastModeratorId" INTEGER,
ADD COLUMN     "resolutionNote" TEXT,
ADD COLUMN     "status" "ReportStatus" NOT NULL DEFAULT 'NEEDS_REVIEW',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "appleId" TEXT,
ADD COLUMN     "banReason" TEXT,
ADD COLUMN     "banned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "bannedAt" TIMESTAMP(3),
ADD COLUMN     "bannedByAdminId" INTEGER,
ADD COLUMN     "deviceFingerprint" TEXT,
ADD COLUMN     "googleId" TEXT,
ADD COLUMN     "phoneNumber" TEXT,
ADD COLUMN     "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "signupIp" TEXT;

-- CreateIndex
CREATE INDEX "Report_status_createdAt_idx" ON "Report"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_phoneNumber_key" ON "User"("phoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "User_appleId_key" ON "User"("appleId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_bannedByAdminId_fkey" FOREIGN KEY ("bannedByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_lastModeratorId_fkey" FOREIGN KEY ("lastModeratorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
