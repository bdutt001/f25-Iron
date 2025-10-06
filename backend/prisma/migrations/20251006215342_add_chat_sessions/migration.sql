/*
  Warnings:

  - You are about to drop the column `receiverId` on the `Message` table. All the data in the column will be lost.
  - Added the required column `chatSessionId` to the `Message` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."Message" DROP CONSTRAINT "Message_receiverId_fkey";

-- AlterTable
ALTER TABLE "public"."Message" DROP COLUMN "receiverId",
ADD COLUMN     "chatSessionId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "profilePicture" TEXT;

-- CreateTable
CREATE TABLE "public"."ChatSession" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ChatParticipant" (
    "id" SERIAL NOT NULL,
    "chatSessionId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatParticipant_chatSessionId_userId_key" ON "public"."ChatParticipant"("chatSessionId", "userId");

-- CreateIndex
CREATE INDEX "Message_chatSessionId_idx" ON "public"."Message"("chatSessionId");

-- AddForeignKey
ALTER TABLE "public"."ChatParticipant" ADD CONSTRAINT "ChatParticipant_chatSessionId_fkey" FOREIGN KEY ("chatSessionId") REFERENCES "public"."ChatSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChatParticipant" ADD CONSTRAINT "ChatParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Message" ADD CONSTRAINT "Message_chatSessionId_fkey" FOREIGN KEY ("chatSessionId") REFERENCES "public"."ChatSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
