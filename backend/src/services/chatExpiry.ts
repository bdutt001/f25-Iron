import prisma from "../prisma";
import { haversineMeters } from "../utils/geo";

const NEARBY_RADIUS_METERS = 1000;
const EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
const WATCH_INTERVAL_MS = 60 * 1000; // 1 minute

type ParticipantLoc = { userId: number; latitude: number; longitude: number; updatedAt: Date };

type ChatState = {
  outOfRange: boolean;
  distanceMeters: number | null;
  expiresAt: Date | null;
  deleted: boolean;
};

const getParticipantLocations = async (chatSessionId: number): Promise<ParticipantLoc[]> => {
  const participants = await prisma.chatParticipant.findMany({
    where: { chatSessionId },
    select: {
      userId: true,
      user: {
        select: {
          locations: {
            orderBy: { updatedAt: "desc" },
            take: 1,
            select: { latitude: true, longitude: true, updatedAt: true },
          },
        },
      },
    },
  });

  return participants
    .map((p) => {
      const loc = p.user.locations[0];
      if (!loc) return null;
      return {
        userId: p.userId,
        latitude: loc.latitude,
        longitude: loc.longitude,
        updatedAt: loc.updatedAt,
      };
    })
    .filter((p): p is ParticipantLoc => Boolean(p));
};

const deleteChatSession = async (chatSessionId: number) => {
  await prisma.$transaction(async (tx) => {
    await tx.message.deleteMany({ where: { chatSessionId } });
    await tx.chatParticipant.deleteMany({ where: { chatSessionId } });
    await tx.chatSession.delete({ where: { id: chatSessionId } });
  });
};

export const updateChatExpiry = async (chatSessionId: number): Promise<ChatState | null> => {
  const chat = await prisma.chatSession.findUnique({
    where: { id: chatSessionId },
    select: { id: true, expiresAt: true },
  });
  if (!chat) return null;

  const now = Date.now();

  if (chat.expiresAt && chat.expiresAt.getTime() <= now) {
    await deleteChatSession(chatSessionId);
    return { outOfRange: true, distanceMeters: null, expiresAt: chat.expiresAt, deleted: true };
  }

  const locations = await getParticipantLocations(chatSessionId);
  if (locations.length < 2) {
    if (chat.expiresAt) {
      await prisma.chatSession.update({
        where: { id: chatSessionId },
        data: { expiresAt: null },
      });
    }
    return { outOfRange: false, distanceMeters: null, expiresAt: null, deleted: false };
  }

  const [a, b] = locations;
  const distance = haversineMeters(a.latitude, a.longitude, b.latitude, b.longitude);
  const outOfRange = Number.isFinite(distance) && distance > NEARBY_RADIUS_METERS;

  let expiresAt: Date | null = chat.expiresAt ?? null;

  if (outOfRange) {
    const candidate = new Date(now + EXPIRY_MS);
    if (!expiresAt || candidate < expiresAt) {
      expiresAt = candidate;
      await prisma.chatSession.update({
        where: { id: chatSessionId },
        data: { expiresAt },
      });
    }
  } else if (expiresAt) {
    expiresAt = null;
    await prisma.chatSession.update({
      where: { id: chatSessionId },
      data: { expiresAt: null },
    });
  }

  return { outOfRange, distanceMeters: distance, expiresAt, deleted: false };
};

const evaluateAllChats = async () => {
  const chats = await prisma.chatSession.findMany({
    select: {
      id: true,
      expiresAt: true,
      participants: {
        select: {
          user: {
            select: {
              id: true,
              locations: {
                orderBy: { updatedAt: "desc" },
                take: 1,
                select: { latitude: true, longitude: true, updatedAt: true },
              },
            },
          },
        },
      },
    },
  });

  const now = Date.now();

  for (const chat of chats) {
    const locations = chat.participants
      .map((p) => {
        const loc = p.user.locations[0];
        if (!loc) return null;
        return {
          userId: p.user.id,
          latitude: loc.latitude,
          longitude: loc.longitude,
          updatedAt: loc.updatedAt,
        } satisfies ParticipantLoc;
      })
      .filter((p): p is ParticipantLoc => Boolean(p));

    if (chat.expiresAt && chat.expiresAt.getTime() <= now) {
      await deleteChatSession(chat.id);
      continue;
    }

    if (locations.length < 2) {
      if (chat.expiresAt) {
        await prisma.chatSession.update({ where: { id: chat.id }, data: { expiresAt: null } });
      }
      continue;
    }

    const [a, b] = locations;
    const distance = haversineMeters(a.latitude, a.longitude, b.latitude, b.longitude);
    const outOfRange = Number.isFinite(distance) && distance > NEARBY_RADIUS_METERS;

    if (outOfRange) {
      const candidate = new Date(Date.now() + EXPIRY_MS);
      if (!chat.expiresAt || candidate < chat.expiresAt) {
        await prisma.chatSession.update({ where: { id: chat.id }, data: { expiresAt: candidate } });
      }
    } else if (chat.expiresAt) {
      await prisma.chatSession.update({ where: { id: chat.id }, data: { expiresAt: null } });
    }
  }
};

const purgeExpiredChats = async () => {
  const expired = await prisma.chatSession.findMany({
    where: { expiresAt: { lte: new Date() } },
    select: { id: true },
  });

  for (const chat of expired) {
    await deleteChatSession(chat.id);
  }
};

export const startChatExpiryWatcher = () => {
  const tick = async () => {
    try {
      await evaluateAllChats();
      await purgeExpiredChats();
    } catch (error) {
      console.error("Chat expiry watcher error:", error);
    }
  };

  // Initial run then interval
  void tick();
  setInterval(tick, WATCH_INTERVAL_MS);
};

export const isChatExpired = (expiresAt: Date | null | undefined) =>
  Boolean(expiresAt && expiresAt.getTime() <= Date.now());
