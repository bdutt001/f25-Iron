import { Router, Request } from "express";
import prisma from "../prisma";
import { authenticate } from "../middleware/authenticate";
import { rejectAdmin } from "../middleware/rejectAdmin";
import { AuthenticatedUser } from "../types/auth";
import { ensureChatAccess } from "../services/chatAccess";
import { broadcastMessageToChat } from "../realtime/messageHub";

const router = Router();

type AuthRequest = Request & { user?: AuthenticatedUser };

router.use(authenticate, rejectAdmin);

// Start or get chat session
router.post("/session", async (req: AuthRequest, res) => {
  const { participants } = req.body as { participants: number[] };
  if (!participants || participants.length !== 2) {
    return res.status(400).json({ message: "Two participants required" });
  }

  try {
    const authUserId = req.user!.id;
    if (!participants.includes(authUserId)) {
      return res.status(403).json({ message: "Authenticated user must be a participant" });
    }

    const participantRecords = await prisma.user.findMany({
      where: { id: { in: participants } },
      select: { id: true, isAdmin: true, banned: true },
    });

    if (participantRecords.length !== participants.length) {
      return res.status(404).json({ message: "Participant not found" });
    }

    const adminParticipant = participantRecords.find((p) => p.isAdmin);
    if (adminParticipant) {
      return res.status(403).json({ message: "Admin accounts cannot join chats" });
    }

    const bannedParticipant = participantRecords.find((p) => p.banned);
    if (bannedParticipant) {
      return res.status(403).json({ message: "Cannot chat with a banned account" });
    }

    const otherId = participants[0] === authUserId ? participants[1] : participants[0];
    const blocked = await prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: authUserId, blockedId: otherId },
          { blockerId: otherId, blockedId: authUserId },
        ],
      },
      select: { id: true },
    });
    if (blocked) {
      return res.status(403).json({ message: "Cannot start chat with blocked user" });
    }

    const existingChat = await prisma.chatSession.findFirst({
      where: {
        AND: participants.map((id) => ({
          participants: { some: { userId: id } },
        })),
      },
      include: { participants: true },
    });

    if (existingChat) return res.status(200).json({ chatId: existingChat.id });

    const chatSession = await prisma.chatSession.create({
      data: {
        participants: { create: participants.map((id) => ({ userId: id })) },
      },
    });

    res.json({ chatId: chatSession.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to create chat" });
  }
});

// Get all conversations for a user
router.get("/conversations/:userId", async (req: AuthRequest, res) => {
  const userId = Number(req.params.userId);
  if (isNaN(userId)) return res.status(400).json({ message: "Invalid userId" });

  try {
    if (req.user?.id !== userId) {
      return res.status(403).json({ message: "Cannot view conversations for another user" });
    }

    const chats = await prisma.chatSession.findMany({
      where: { participants: { some: { userId } } },
      include: {
        participants: { include: { user: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    const blockPairs = await prisma.block.findMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      select: { blockerId: true, blockedId: true },
    });
    const hiddenIds = new Set<number>();
    for (const b of blockPairs) {
      hiddenIds.add(b.blockerId === userId ? b.blockedId : b.blockerId);
    }

    const visibleChats = chats.filter((chat) => {
      const otherParticipant = chat.participants.find((p) => p.userId !== userId)?.user;
      if (!otherParticipant) return false;
      if (otherParticipant.isAdmin || otherParticipant.banned) return false;
      return !hiddenIds.has(otherParticipant.id);
    });

    const chatIds = visibleChats.map((chat) => chat.id);
    const lastIncomingMap = new Map<number, Date>();
    if (chatIds.length > 0) {
      const inboundByChat = await prisma.message.groupBy({
        by: ["chatSessionId"],
        where: {
          chatSessionId: { in: chatIds },
          senderId: { not: userId },
        },
        _max: { createdAt: true },
      });
      for (const entry of inboundByChat) {
        if (entry._max.createdAt) {
          lastIncomingMap.set(entry.chatSessionId, entry._max.createdAt);
        }
      }
    }

    const conversations = visibleChats.map((chat) => {
      const otherParticipant = chat.participants.find((p) => p.userId !== userId)?.user;
      const lastMsg = chat.messages[0];
      let receiverProfilePicture: string | null = null;
      if (otherParticipant?.profilePicture) {
        receiverProfilePicture = otherParticipant.profilePicture.startsWith("http")
          ? otherParticipant.profilePicture
          : `${process.env.API_BASE_URL || ""}${otherParticipant.profilePicture}`;
      }
      const lastIncomingAt = lastIncomingMap.get(chat.id);

      return {
        id: chat.id.toString(),
        name: otherParticipant?.name ?? otherParticipant?.email ?? "Unknown",
        lastMessage: lastMsg?.content,
        lastTimestamp: lastMsg?.createdAt.toISOString(),
        receiverId: otherParticipant?.id,
        receiverProfilePicture,
        lastSenderId: lastMsg?.senderId ?? null,
        lastIncomingTimestamp: lastIncomingAt ? lastIncomingAt.toISOString() : null,
      };
    });

    res.json(conversations);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to load conversations" });
  }
});

// Get all messages in a chat
router.get("/:chatId", async (req: AuthRequest, res) => {
  const chatId = Number(req.params.chatId);
  if (isNaN(chatId)) return res.status(400).json({ message: "Invalid chatId" });

  try {
    const userId = req.user!.id;
    const access = await ensureChatAccess(chatId, userId);
    if (access.allowed === false) {
      const status = access.reason === "not_found" ? 404 : 403;
      return res.status(status).json({ message: "You cannot access this chat" });
    }

    const messages = await prisma.message.findMany({
      where: { chatSessionId: chatId },
      orderBy: { createdAt: "asc" },
    });

    res.json(messages);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to load messages" });
  }
});

// Send a new message
router.post("/", async (req: AuthRequest, res) => {
  const { content, chatSessionId } = req.body as { content: string; chatSessionId: number };
  if (!content || !chatSessionId) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  try {
    const chatSessionIdNum = Number(chatSessionId);
    const userId = req.user!.id;
    const access = await ensureChatAccess(chatSessionIdNum, userId);
    if (access.allowed === false) {
      const status = access.reason === "not_found" ? 404 : 403;
      return res.status(status).json({ message: "You cannot send messages to this chat" });
    }

    const message = await prisma.message.create({
      data: {
        content,
        senderId: userId,
        chatSessionId: chatSessionIdNum,
      },
    });

    broadcastMessageToChat(chatSessionIdNum, {
      id: message.id,
      content: message.content,
      senderId: message.senderId,
      chatSessionId: message.chatSessionId,
      createdAt: message.createdAt.toISOString(),
    });

    res.json(message);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to send message" });
  }
});

export default router;
