import prisma from "../prisma";
import { isChatExpired, updateChatExpiry } from "./chatExpiry";

type AccessCheckResult =
  | { allowed: true; otherUserId: number | null }
  | { allowed: false; reason: "not_found" | "forbidden" | "blocked" };

/**
 * Validates that a user can access a chat session.
 * - Ensures the chat exists.
 * - Ensures the user is a participant.
 * - Blocks access if either participant has blocked the other.
 */
export const ensureChatAccess = async (chatSessionId: number, userId: number): Promise<AccessCheckResult> => {
  const chat = await prisma.chatSession.findUnique({
    where: { id: chatSessionId },
    select: {
      expiresAt: true,
      participants: true,
    },
  });
  if (!chat) {
    return { allowed: false, reason: "not_found" };
  }

  if (isChatExpired(chat.expiresAt)) {
    await prisma.chatSession.delete({ where: { id: chatSessionId } }).catch(() => {});
    return { allowed: false, reason: "not_found" };
  }

  const isParticipant = chat.participants.some((p) => p.userId === userId);
  if (!isParticipant) {
    return { allowed: false, reason: "forbidden" };
  }

  const otherUserId = chat.participants.find((p) => p.userId !== userId)?.userId ?? null;
  if (otherUserId) {
    const blocked = await prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: userId, blockedId: otherUserId },
          { blockerId: otherUserId, blockedId: userId },
        ],
      },
      select: { id: true },
    });
    if (blocked) {
      return { allowed: false, reason: "blocked" };
    }
  }

  return { allowed: true, otherUserId };
};

