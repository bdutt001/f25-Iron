-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "interestTags" TEXT[] DEFAULT ARRAY[]::TEXT[];
