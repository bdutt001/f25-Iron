// // export default router;
// import { Router, Request } from "express";
// import prisma from "../prisma";
// import { authenticate } from "../middleware/authenticate";
// import { AuthenticatedUser } from "../types/auth";

// const router = Router();

// // Type extension to include authenticated user
// type AuthRequest = Request & { user?: AuthenticatedUser };

// // -------------------------
// // Start or get chat session
// // -------------------------
// router.post("/session", authenticate, async (req: AuthRequest, res) => {
//   const { participants } = req.body as { participants: number[] };
//   if (!participants || participants.length !== 2) {
//     return res.status(400).json({ message: "Two participants required" });
//   }

//   try {
//     // Check for existing chat session
//     const existingChat = await prisma.chatSession.findFirst({
//       where: {
//         AND: participants.map((id) => ({
//           participants: { some: { userId: id } },
//         })),
//       },
//       include: { participants: true },
//     });

//     if (existingChat) return res.status(200).json({ chatId: existingChat.id });

//     // Create new chat session
//     const chatSession = await prisma.chatSession.create({
//       data: {
//         participants: { create: participants.map((id) => ({ userId: id })) },
//       },
//     });

//     res.json({ chatId: chatSession.id });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ message: "Failed to create chat" });
//   }
// });


// // -------------------------
// // Send a new message
// // -------------------------
// router.post("/", authenticate, async (req: AuthRequest, res) => {
//   const { content, senderId, chatSessionId } = req.body as {
//     content: string;
//     senderId: number;
//     chatSessionId: number;
//   };

//   if (!content || !senderId || !chatSessionId) {
//     return res.status(400).json({ message: "Missing required fields" });
//   }

//   try {
//     const message = await prisma.message.create({
//       data: {
//         content,
//         senderId,
//         chatSessionId,
//       },
//     });

//     res.json(message);
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ message: "Failed to send message" });
//   }
// });

// // -------------------------
// // Get all conversations for a user
// // -------------------------
// router.get("/conversations/:userId", authenticate, async (req: AuthRequest, res) => {
//   const userId = Number(req.params.userId);
//   if (isNaN(userId)) return res.status(400).json({ message: "Invalid userId" });

//   try {
//     const chats = await prisma.chatSession.findMany({
//       where: { participants: { some: { userId } } },
//       include: {
//         participants: { include: { user: true } },
//         messages: { orderBy: { createdAt: "desc" }, take: 1 },
//       },
//     });

//     const conversations = chats.map((chat) => {
//       const otherParticipant = chat.participants.find((p) => p.userId !== userId)?.user;
//       const lastMsg = chat.messages[0];

//       return {
//         id: otherParticipant?.id.toString() ?? "",
//         name: otherParticipant?.name ?? otherParticipant?.username ?? "Unknown",
//         lastMessage: lastMsg?.content,
//         lastTimestamp: lastMsg?.createdAt.toISOString(),
//       };
//     });

//     res.json(conversations);
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ message: "Failed to load conversations" });
//   }
// });

// // -------------------------
// // Get all messages in a chat
// // -------------------------
// router.get("/:chatId", authenticate, async (req: AuthRequest, res) => {
//   const chatId = Number(req.params.chatId);
//   if (isNaN(chatId)) return res.status(400).json({ message: "Invalid chatId" });

//   try {
//     const messages = await prisma.message.findMany({
//       where: { chatSessionId: chatId },
//       orderBy: { createdAt: "asc" },
//     });

//     res.json(messages);
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ message: "Failed to load messages" });
//   }
// });


// export default router;
import { Router, Request } from "express";
import prisma from "../prisma";
import { authenticate } from "../middleware/authenticate";
import { AuthenticatedUser } from "../types/auth";

const router = Router();

// Extend Request type to include authenticated user
type AuthRequest = Request & { user?: AuthenticatedUser };

// -------------------------
// Start or get chat session
// -------------------------
router.post("/session", authenticate, async (req: AuthRequest, res) => {
  const { participants } = req.body as { participants: number[] };
  if (!participants || participants.length !== 2) {
    return res.status(400).json({ message: "Two participants required" });
  }

  try {
    // Check for existing chat session
    const existingChat = await prisma.chatSession.findFirst({
      where: {
        AND: participants.map((id) => ({
          participants: { some: { userId: id } },
        })),
      },
      include: { participants: true },
    });

    if (existingChat) return res.status(200).json({ chatId: existingChat.id });

    // Create new chat session
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

// -------------------------
// Get all messages in a chat
// -------------------------
router.get("/:chatId", authenticate, async (req: AuthRequest, res) => {
  const chatId = Number(req.params.chatId);
  if (isNaN(chatId)) return res.status(400).json({ message: "Invalid chatId" });

  try {
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

// -------------------------
// Send a new message
// -------------------------
router.post("/", authenticate, async (req: AuthRequest, res) => {
  const { content, chatSessionId } = req.body;
  if (!content || !chatSessionId) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  try {
    const message = await prisma.message.create({
      data: {
        content,
        senderId: req.user!.id, // use authenticated user
        chatSessionId,
      },
    });

    res.json(message);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to send message" });
  }
});

// -------------------------
// Get all conversations for a user
// -------------------------
router.get("/conversations/:userId", authenticate, async (req: AuthRequest, res) => {
  const userId = Number(req.params.userId);
  if (isNaN(userId)) return res.status(400).json({ message: "Invalid userId" });

  try {
    const chats = await prisma.chatSession.findMany({
      where: { participants: { some: { userId } } },
      include: {
        participants: { include: { user: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    const conversations = chats.map((chat) => {
      const otherParticipant = chat.participants.find((p) => p.userId !== userId)?.user;
      const lastMsg = chat.messages[0];

      return {
        id: chat.id.toString(), // use ChatSession ID
        name: otherParticipant?.name ?? otherParticipant?.username ?? "Unknown",
        lastMessage: lastMsg?.content,
        lastTimestamp: lastMsg?.createdAt.toISOString(),
      };
    });

    res.json(conversations);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to load conversations" });
  }
});

export default router;
