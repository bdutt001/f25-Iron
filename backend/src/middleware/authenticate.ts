import { NextFunction, Request, Response } from "express";
import { jwtConfig } from "../config/env";
import prisma from "../prisma";
import { verifyJwt } from "../utils/jwt";
import type { JwtPayload } from "../utils/jwt";
import type { AuthenticatedUser } from "../types/auth";

interface AuthTokenPayload extends JwtPayload {
  username?: unknown;
  email?: unknown;
  tokenVersion?: unknown;
}

const buildUserFromRecord = (record: {
  id: number;
  username: string;
  email: string | null;
}): AuthenticatedUser => ({
  id: record.id,
  username: record.username,
  email: record.email,
});

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authorization header with Bearer token is required" });
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    return res.status(401).json({ error: "Bearer token is missing" });
  }

  let payload: AuthTokenPayload;

  try {
    payload = verifyJwt<AuthTokenPayload>(token, jwtConfig.accessSecret);
  } catch (error) {
    console.error("JWT verification failed:", error);
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  if (typeof payload.sub !== "string") {
    return res.status(401).json({ error: "Invalid token subject" });
  }

  const userId = Number(payload.sub);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(401).json({ error: "Invalid token subject" });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        tokenVersion: true,
      },
    });

    if (!user) {
      return res.status(401).json({ error: "Account not found" });
    }

    if (typeof payload.tokenVersion !== "number" || payload.tokenVersion !== user.tokenVersion) {
      return res.status(401).json({ error: "Session is no longer valid" });
    }

    const authUser = buildUserFromRecord(user);
    req.tokenPayload = payload;
    req.user = authUser;
    res.locals.user = authUser;
  } catch (error) {
    console.error("Failed to perform authentication lookup:", error);
    return res.status(500).json({ error: "Failed to validate session" });
  }

  return next();
};
