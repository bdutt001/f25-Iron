-- Add optional reporter-provided context note to reports for admin visibility
ALTER TABLE "public"."Report"
ADD COLUMN "contextNote" TEXT;
