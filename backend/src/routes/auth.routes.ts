/**
 * Authentication Routes
 *
 * Defines routes for user registration, login, token refresh, logout,
 * and profile retrieval. Handles hashing, JWT issuance, and Prisma queries.
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
 * Normalize and validate helpers
 */
const normalizePlain = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const normalizeEmail = (value: unknown): string =>
  normalizePlain(value).toLowerCase();

const validateEmail = (email: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

/**
 * Detect Prisma unique constraint violations
 */
const handlePrismaUniqueError = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === "P2002";

/**
 * Shape Prisma user → clean JSON response
 */
const serializeUser = (user: any) => ({
  ...user,
  profilePicture: user.profilePicture ?? null,
  interestTags: (user.interestTags ?? []).map((t: any) => t.name),
  visibility: user.visibility ?? false,
  lastLogin: user.lastLogin ?? null,
});

/**
 * Prisma field selection for auth-related queries
 */
const userAuthSelect = {
  id: true,
  email: true,
  name: true,
  password: true,
  tokenVersion: true,
  profilePicture: true, // ✅ added
  interestTags: { select: { name: true } }, // ✅ added
  createdAt: true,
  visibility: true,
  lastLogin: true,
} as const;

type UserAuthRecord = {
  id: number;
  email: string | null;
  name: string | null;
  password: string;
  tokenVersion: number;
  profilePicture: string | null;
  interestTags?: { name: string }[];
  createdAt: Date;
  visibility: boolean;
  lastLogin: Date | null;
};

/**
 * Build the authentication response containing tokens and user info.
 */
const buildAuthResponse = (user: UserAuthRecord) => {
  const tokens = issueTokenPair({
    id: user.id,
    email: user.email,
    name: user.name ?? undefined,
    tokenVersion: user.tokenVersion,
  });

  return {
    tokenType: tokens.tokenType,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresIn: tokens.expiresIn,
    refreshExpiresIn: tokens.refreshExpiresIn,
    user: toAuthenticatedUser({
      id: user.id,
      email: user.email,
      name: user.name ?? undefined,
      profilePicture: user.profilePicture ?? null,
      interestTags: user.interestTags ?? [],
      visibility: user.visibility,
      lastLogin: user.lastLogin ?? null,
    }),
  };
};

/**
 * POST /register
 * Register a new user with email, name, and password.
 */
router.post("/register", async (req: Request, res: Response) => {
  const email = normalizeEmail(req.body.email);
  const name = normalizePlain(req.body.name);
  const password = typeof req.body.password === "string" ? req.body.password : "";

  // Validation
  if (!email || !validateEmail(email))
    return res.status(400).json({ error: "A valid email address is required" });
  if (!password || password.length < 8)
    return res
      .status(400)
      .json({ error: "Password must be at least 8 characters long" });

  try {
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await prisma.user.create({
      data: {
        email,
        name: name || undefined,
        password: hashedPassword,
        lastLogin: new Date(),
      },
      select: userAuthSelect,
    });

    return res.status(201).json(buildAuthResponse(user));
  } catch (error) {
    if (handlePrismaUniqueError(error))
      return res.status(409).json({ error: "Email already exists" });

    console.error("Register Error:", error);
    return res.status(500).json({ error: "Registration failed" });
  }
});

/**
 * POST /login
 * Authenticate a user with email and password.
 */
router.post("/login", async (req: Request, res: Response) => {
  const email = normalizeEmail(req.body.email);
  const password = typeof req.body.password === "string" ? req.body.password : "";

  if (!email || !validateEmail(email))
    return res.status(400).json({ error: "A valid email address is required" });
  if (!password)
    return res.status(400).json({ error: "Password is required" });

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: userAuthSelect,
    });

    if (!user) return res.status(404).json({ error: "Invalid credentials" });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: "Invalid credentials" });

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
      select: userAuthSelect,
    });

    return res.json(buildAuthResponse(updatedUser));
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

  if (!refreshToken)
    return res.status(400).json({ error: "Refresh token is required" });

  try {
    const payload = verifyRefreshToken(refreshToken);
    const userId = Number(payload.sub);

    if (!Number.isInteger(userId) || userId <= 0)
      return res.status(401).json({ error: "Invalid refresh token" });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: userAuthSelect,
    });

    if (!user)
      return res.status(401).json({ error: "Account not found" });

    if (payload.tokenVersion !== user.tokenVersion)
      return res.status(401).json({ error: "Refresh token is no longer valid" });

    return res.json(buildAuthResponse(user));
  } catch (error) {
    console.error("Refresh Error:", error);
    return res.status(401).json({ error: "Invalid or expired refresh token" });
  }
});

/**
 * POST /logout
 * Invalidate the authenticated user's active sessions.
 */
router.post("/logout", authenticate, async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

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
 * Retrieve the authenticated user's profile info.
 */
router.get("/me", authenticate, async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
        visibility: true,
        profilePicture: true,
        interestTags: { select: { name: true } },
        createdAt: true,
        lastLogin: true,
      },
    });

    if (!user) return res.status(404).json({ error: "User not found" });

    console.log("🧩 /me → user.interestTags:", user.interestTags);
    return res.json(serializeUser(user));
  } catch (error) {
    console.error("Profile Error:", error);
    return res.status(500).json({ error: "Failed to load profile" });
  }
});

export default router;
