/**
 * This file defines Express routes for authentication, including user registration,
 * login, token refresh, logout, and fetching the authenticated user's profile.
 * It handles user credential validation, password hashing, token issuance,
 * and session invalidation using Prisma ORM and JWT-based authentication.
 */

import { Prisma } from "@prisma/client";
import bcrypt from "bcrypt";
import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/authenticate";
import prisma from "../prisma";
import {
  invalidateUserSessions,
  issueTokenPair,
  toAuthenticatedUser,
  verifyRefreshToken,
} from "../services/auth.service";

const router = Router();

const SALT_ROUNDS = 12;

/**
 * Normalize a value to a trimmed string.
 * @param value - The input value of unknown type.
 * @returns The trimmed string if input is a string; otherwise, an empty string.
 */
const normalizePlain = (value: unknown): string => {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
};

/**
 * Normalize an email address by trimming and converting to lowercase.
 * @param value - The input email value of unknown type.
 * @returns The normalized email string.
 */
const normalizeEmail = (value: unknown): string => {
  const plain = normalizePlain(value);
  return plain.toLowerCase();
};

/**
 * Validate the format of an email address.
 * @param email - The email string to validate.
 * @returns True if the email matches the regex pattern; otherwise false.
 */
const validateEmail = (email: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

/**
 * Check if an error is a Prisma unique constraint violation.
 * @param error - The error object to check.
 * @returns True if the error is a Prisma unique constraint error; otherwise false.
 */
const handlePrismaUniqueError = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === "P2002";

/**
 * Serialize Prisma user → safe flattened JSON
 */
const serializeUser = (user: any) => ({
  ...user,
  interestTags: (user.interestTags ?? []).map((t: any) => t.name),
});

/**
 * Unified select for consistent user responses.
 */
const baseUserSelect = {
  id: true,
  username: true,
  email: true,
  name: true,
  status: true,
  visibility: true,
  profilePicture: true,
  interestTags: { select: { name: true } },
  createdAt: true,
  tokenVersion: true,
  password: true,
};

/**
 * Build the authentication response containing tokens and user info.
 */
const buildAuthResponse = (user: any) => {
  const tokens = issueTokenPair(user);
  return {
    tokenType: tokens.tokenType,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresIn: tokens.expiresIn,
    refreshExpiresIn: tokens.refreshExpiresIn,
  };
};

/**
 * POST /register
 * Register a new user with username, email, and password.
 */
router.post("/register", async (req: Request, res: Response) => {
  const username = normalizePlain(req.body.username);
  const email = normalizeEmail(req.body.email);
  const password = typeof req.body.password === "string" ? req.body.password : "";

  if (!username || username.length < 3) {
    return res
      .status(400)
      .json({ error: "Username must be at least 3 characters long" });
  }
  if (!email || !validateEmail(email)) {
    return res.status(400).json({ error: "A valid email address is required" });
  }
  if (!password || password.length < 8) {
    return res
      .status(400)
      .json({ error: "Password must be at least 8 characters long" });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await prisma.user.create({
      data: { username, email, password: hashedPassword },
      select: baseUserSelect,
    });

    const tokens = buildAuthResponse(user);
    return res.status(201).json({
      ...tokens,
      user: serializeUser(toAuthenticatedUser(user)),
    });
  } catch (error) {
    if (handlePrismaUniqueError(error)) {
      return res.status(409).json({ error: "Username or email already exists" });
    }
    console.error("Register Error:", error);
    return res.status(500).json({ error: "Registration failed" });
  }
});

/**
 * POST /login
 * Authenticate a user with username/email and password.
 */
router.post("/login", async (req: Request, res: Response) => {
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const identifierRaw = req.body.identifier ?? req.body.username ?? req.body.email;
  const identifier = normalizePlain(identifierRaw);

  if (!identifier) {
    return res
      .status(400)
      .json({ error: "Username or email is required to log in" });
  }
  if (!password) {
    return res.status(400).json({ error: "Password is required" });
  }

  const whereClause =
    identifier.includes("@") && validateEmail(identifier)
      ? { email: normalizeEmail(identifier) }
      : { username: identifier };

  try {
    const user = await prisma.user.findUnique({
      where: whereClause,
      select: baseUserSelect,
    });

    if (!user) {
      return res.status(404).json({ error: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const tokens = buildAuthResponse(user);
    const { password: _pw, ...safeUser } = user;

    return res.json({
      ...tokens,
      user: serializeUser(toAuthenticatedUser(safeUser)),
    });
  } catch (error) {
    console.error("Login Error:", error);
    return res.status(500).json({ error: "Login failed" });
  }
});

/**
 * POST /refresh
 * Refresh access tokens using a valid refresh token.
 */
router.post("/refresh", async (req: Request, res: Response) => {
  const refreshToken =
    typeof req.body.refreshToken === "string" ? req.body.refreshToken.trim() : "";

  if (!refreshToken) {
    return res.status(400).json({ error: "Refresh token is required" });
  }

  try {
    const payload = verifyRefreshToken(refreshToken);
    const userId = Number(payload.sub);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({ error: "Invalid refresh token" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: baseUserSelect,
    });

    if (!user) {
      return res.status(401).json({ error: "Account not found" });
    }

    if (payload.tokenVersion !== user.tokenVersion) {
      return res.status(401).json({ error: "Refresh token is no longer valid" });
    }

    const tokens = buildAuthResponse(user);
    return res.json({
      ...tokens,
      user: serializeUser(toAuthenticatedUser(user)),
    });
  } catch (error) {
    console.error("Refresh Error:", error);
    return res.status(401).json({ error: "Invalid or expired refresh token" });
  }
});

/**
 * POST /logout
 * Log out the authenticated user by invalidating their sessions.
 */
router.post("/logout", authenticate, async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    await invalidateUserSessions(userId);
    return res.status(204).send();
  } catch (error) {
    console.error("Logout Error:", error);
    return res.status(500).json({ error: "Failed to log out" });
  }
});

/**
 * GET /me
 * Retrieve the authenticated user's profile information.
 */
router.get("/me", authenticate, async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: baseUserSelect,
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json(serializeUser(toAuthenticatedUser(user)));
  } catch (error) {
    console.error("Profile Error:", error);
    return res.status(500).json({ error: "Failed to load profile" });
  }
});

export default router;
