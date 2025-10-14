-- Add nullable username column so existing rows remain valid
ALTER TABLE "User" ADD COLUMN "username" TEXT;

-- Enforce uniqueness when values are provided
CREATE UNIQUE INDEX "User_username_key" ON "User"("username") WHERE "username" IS NOT NULL;
