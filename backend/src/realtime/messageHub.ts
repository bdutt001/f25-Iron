import { IncomingMessage, Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import prisma from "../prisma";
import { verifyJwt, type JwtPayload } from "../utils/jwt";
import { jwtConfig } from "../config/env";
import { ensureChatAccess } from "../services/chatAccess";

type LiveMessagePayload = {
  id: number;
  content: string;
  senderId: number;
  chatSessionId: number;
  createdAt: string;
};

type Client = {
  socket: WebSocket;
  userId: number;
  chatId: number;
  isAlive: boolean;
};

type AuthTokenPayload = JwtPayload & { tokenVersion?: unknown };

const clients = new Set<Client>();
let wss: WebSocketServer | null = null;

const parseToken = (request: IncomingMessage): string | null => {
  const authHeader = request.headers.authorization;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length).trim();
    if (token) return token;
  }

  try {
    const url = new URL(request.url ?? "", "http://localhost");
    const tokenParam = url.searchParams.get("token");
    if (tokenParam) return tokenParam;
  } catch {
    // ignore parse errors
  }

  return null;
};

const authenticateRequest = async (request: IncomingMessage): Promise<number | null> => {
  const token = parseToken(request);
  if (!token) return null;

  let payload: AuthTokenPayload;
  try {
    payload = verifyJwt<AuthTokenPayload>(token, jwtConfig.accessSecret);
  } catch (error) {
    console.warn("Live socket auth failed:", error);
    return null;
  }

  if (typeof payload.sub !== "string") return null;
  const userId = Number(payload.sub);
  if (!Number.isInteger(userId) || userId <= 0) return null;

  const userRecord = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, tokenVersion: true },
  });
  if (!userRecord) return null;

  if (typeof payload.tokenVersion !== "number" || payload.tokenVersion !== userRecord.tokenVersion) {
    return null;
  }

  return userRecord.id;
};

const closeSocket = (client: Client, code: number, reason: string) => {
  try {
    client.socket.close(code, reason);
  } catch {
    // ignore
  }
  clients.delete(client);
};

export const startMessageHub = (server: Server) => {
  if (wss) {
    return;
  }

  wss = new WebSocketServer({
    server,
    path: "/api/messages/live",
  });

  const heartbeat = setInterval(() => {
    for (const client of clients) {
      if (!client.isAlive) {
        closeSocket(client, 1001, "Heartbeat timeout");
        continue;
      }
      client.isAlive = false;
      try {
        client.socket.ping();
      } catch {
        closeSocket(client, 1011, "Ping failed");
      }
    }
  }, 30000);

  wss.on("close", () => clearInterval(heartbeat));

  wss.on("connection", async (socket, request) => {
    const url = new URL(request.url ?? "", "http://localhost");
    const chatId = Number(url.searchParams.get("chatId"));
    if (!Number.isInteger(chatId) || chatId <= 0) {
      socket.close(4400, "Invalid chatId");
      return;
    }

    const userId = await authenticateRequest(request);
    if (!userId) {
      socket.close(4401, "Unauthorized");
      return;
    }

    const access = await ensureChatAccess(chatId, userId);
    if (access.allowed === false) {
      const code = access.reason === "not_found" ? 4404 : 4403;
      socket.close(code, "Forbidden");
      return;
    }

    const client: Client = { socket, userId, chatId, isAlive: true };
    clients.add(client);

    socket.on("pong", () => {
      client.isAlive = true;
    });

    socket.on("close", () => {
      clients.delete(client);
    });

    socket.on("error", () => {
      closeSocket(client, 1011, "Socket error");
    });

    try {
      socket.send(JSON.stringify({ type: "connected" }));
    } catch {
      closeSocket(client, 1011, "Failed to send welcome");
    }
  });
};

export const broadcastMessageToChat = (chatId: number, message: LiveMessagePayload) => {
  if (!wss) return;

  const payload = JSON.stringify({ type: "message", data: message });
  for (const client of clients) {
    if (client.chatId !== chatId) continue;
    if (client.socket.readyState !== WebSocket.OPEN) {
      closeSocket(client, 1011, "Socket not open");
      continue;
    }
    try {
      client.socket.send(payload);
    } catch {
      closeSocket(client, 1011, "Failed to push message");
    }
  }
};

