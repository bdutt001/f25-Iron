-- AlterTable
ALTER TABLE "Report" ADD COLUMN "severity" INTEGER DEFAULT 1;

-- Set a default for future trust score values
ALTER TABLE "User" ALTER COLUMN "trustScore" SET DEFAULT 99;

-- Initialize severity for existing reports
UPDATE "Report" SET "severity" = 1 WHERE "severity" IS NULL;
