/**
 * Authentication Routes
 *
 * Defines routes for user registration, login, token refresh, logout,
 * and profile retrieval. Handles hashing, JWT issuance, Prisma queries,
 * banned-account enforcement, and lightweight signup rate limiting.
 */

import { Prisma } from "@prisma/client";
import bcrypt from "bcrypt";
import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/authenticate";
import prisma from "../prisma";
import { randomOduLocation } from "../config/location";
import {
  invalidateUserSessions,
  issueTokenPair,
  toAuthenticatedUser,
  verifyRefreshToken,
} from "../services/auth.service";

const router = Router();
const SALT_ROUNDS = 12;
const SIGNUP_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const SIGNUP_MAX_ATTEMPTS = 5;
const signupAttempts = new Map<string, { count: number; windowStart: number }>();

/**
 * Normalize and validate helpers
 */
const normalizePlain = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const normalizeEmail = (value: unknown): string =>
  normalizePlain(value).toLowerCase();

const validateEmail = (email: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const getClientIp = (req: Request): string => {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim().length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || "unknown";
};

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
  trustScore: user.trustScore ?? null,
  isAdmin: !!user.isAdmin,
  banned: !!user.banned,
  bannedAt: user.bannedAt ?? null,
  banReason: user.banReason ?? null,
  phoneNumber: user.phoneNumber ?? null,
  phoneVerified: user.phoneVerified ?? false,
  googleId: user.googleId ?? null,
  appleId: user.appleId ?? null,
  deviceFingerprint: user.deviceFingerprint ?? null,
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
  profilePicture: true, // ? added
  interestTags: { select: { name: true } }, // ? added
  createdAt: true,
  visibility: true,
  profileStatus: true, // ? from profile-status branch
  lastLogin: true, // ? from main
  trustScore: true,
  isAdmin: true,
  banned: true,
  bannedAt: true,
  banReason: true,
  phoneNumber: true,
  phoneVerified: true,
  googleId: true,
  appleId: true,
  deviceFingerprint: true,
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
  profileStatus?: string | null;
  lastLogin: Date | null;
  trustScore?: number | null;
  isAdmin?: boolean | null;
  banned?: boolean | null;
  bannedAt?: Date | null;
  banReason?: string | null;
  phoneNumber?: string | null;
  phoneVerified?: boolean | null;
  googleId?: string | null;
  appleId?: string | null;
  deviceFingerprint?: string | null;
};

/**
 * Build the authentication response containing tokens and user info.
 */
const buildAuthResponse = (user: UserAuthRecord) => {
  const tokens = issueTokenPair({
    id: user.id,
    email: user.email,
    name: user.name ?? null,
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
      name: user.name ?? null,
      profilePicture: user.profilePicture ?? null,
      interestTags: user.interestTags ?? [],
      visibility: user.visibility,
      profileStatus: user.profileStatus ?? null,
      lastLogin: user.lastLogin ?? null,
      trustScore: user.trustScore ?? null,
      isAdmin: user.isAdmin ?? null,
      banned: user.banned ?? null,
      bannedAt: user.bannedAt ?? null,
      banReason: user.banReason ?? null,
      phoneNumber: user.phoneNumber ?? null,
      phoneVerified: user.phoneVerified ?? null,
      googleId: user.googleId ?? null,
      appleId: user.appleId ?? null,
      deviceFingerprint: user.deviceFingerprint ?? null,
    }),
  };
};

/**
 * POST /register
 * Register a new user with email, name, and password.
 */
router.post("/register", async (req: Request, res: Response) => {
  const ipKey = getClientIp(req);
  const deviceFingerprint = normalizePlain(req.body.deviceFingerprint) || null;
  const throttleKey = deviceFingerprint || ipKey;
  const now = Date.now();
  const existingWindow = signupAttempts.get(throttleKey);
  if (!existingWindow || now - existingWindow.windowStart > SIGNUP_WINDOW_MS) {
    signupAttempts.set(throttleKey, { count: 1, windowStart: now });
  } else if (existingWindow.count >= SIGNUP_MAX_ATTEMPTS) {
    return res
      .status(429)
      .json({ error: "Too many sign-up attempts. Please try again later." });
  } else {
    signupAttempts.set(throttleKey, {
      windowStart: existingWindow.windowStart,
      count: existingWindow.count + 1,
    });
  }

  const email = normalizeEmail(req.body.email);
  const name = normalizePlain(req.body.name);
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const phoneNumberRaw = normalizePlain(req.body.phoneNumber);
  const phoneNumber = phoneNumberRaw || null;
  const googleId = normalizePlain(req.body.googleId) || null;
  const appleId = normalizePlain(req.body.appleId) || null;

  // Validation
  if (!email || !validateEmail(email))
    return res.status(400).json({ error: "A valid email address is required" });
  if (!password || password.length < 8)
    return res
      .status(400)
      .json({ error: "Password must be at least 8 characters long" });

  try {
    const bannedMatch = await prisma.user.findUnique({
      where: { email },
      select: { banned: true, bannedAt: true, banReason: true },
    });
    if (bannedMatch?.banned) {
      return res.status(403).json({
        error: "This email is tied to a banned account",
        bannedAt: bannedMatch.bannedAt,
        banReason: bannedMatch.banReason,
      });
    }

    if (phoneNumber) {
      const bannedPhone = await prisma.user.findFirst({
        where: { phoneNumber },
        select: { banned: true, bannedAt: true, banReason: true },
      });
      if (bannedPhone?.banned) {
        return res.status(403).json({
          error: "This phone number is tied to a banned account",
          bannedAt: bannedPhone.bannedAt,
          banReason: bannedPhone.banReason,
        });
      }
    }

    if (googleId) {
      const bannedGoogle = await prisma.user.findFirst({
        where: { googleId },
        select: { banned: true, bannedAt: true, banReason: true },
      });
      if (bannedGoogle?.banned) {
        return res.status(403).json({
          error: "This Google account is tied to a banned profile",
          bannedAt: bannedGoogle.bannedAt,
          banReason: bannedGoogle.banReason,
        });
      }
    }

    if (appleId) {
      const bannedApple = await prisma.user.findFirst({
        where: { appleId },
        select: { banned: true, bannedAt: true, banReason: true },
      });
      if (bannedApple?.banned) {
        return res.status(403).json({
          error: "This Apple account is tied to a banned profile",
          bannedAt: bannedApple.bannedAt,
          banReason: bannedApple.banReason,
        });
      }
    }

    if (deviceFingerprint) {
      const bannedDevice = await prisma.user.findFirst({
        where: { deviceFingerprint },
        select: { banned: true, bannedAt: true, banReason: true },
      });
      if (bannedDevice?.banned) {
        return res.status(403).json({
          error: "This device is tied to a banned profile",
          bannedAt: bannedDevice.bannedAt,
          banReason: bannedDevice.banReason,
        });
      }
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await prisma.$transaction(async (tx) => {
      const oduCoords = randomOduLocation();

      const createdUser = await tx.user.create({
        data: {
          email,
          name: name || null,
          password: hashedPassword,
          lastLogin: new Date(),
          signupIp: ipKey,
          phoneNumber,
          phoneVerified: false,
          googleId,
          appleId,
          deviceFingerprint,
        },
        select: userAuthSelect,
      });

      await tx.userLocation.create({
        data: {
          userId: createdUser.id,
          latitude: oduCoords.latitude,
          longitude: oduCoords.longitude,
        },
      });

      return createdUser;
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

    if (user.banned) {
      return res.status(403).json({
        error: "This account is banned",
        bannedAt: user.bannedAt,
        banReason: user.banReason,
      });
    }

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

    if (user.banned) {
      return res.status(403).json({
        error: "This account is banned",
        bannedAt: user.bannedAt,
        banReason: user.banReason,
      });
    }

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
    const profileSelect = {
      id: true,
      email: true,
      name: true,
      profileStatus: true,
      visibility: true,
      profilePicture: true,
      interestTags: { select: { name: true } },
      createdAt: true,
      lastLogin: true,
      trustScore: true,
      isAdmin: true,
      banned: true,
      bannedAt: true,
      banReason: true,
      phoneNumber: true,
      phoneVerified: true,
      googleId: true,
      appleId: true,
      deviceFingerprint: true,
    } as const;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: profileSelect,
    });

    if (!user) return res.status(404).json({ error: "User not found" });

    return res.json(serializeUser(user));
  } catch (error) {
    console.error("Profile Error:", error);
    return res.status(500).json({ error: "Failed to load profile" });
  }
});

export default router;
