import { Prisma } from "@prisma/client";
import bcrypt from "bcrypt";
import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/authenticate";
import prisma from "../prisma";
import {
  invalidateUserSessions,
  issueTokenPair,
  verifyRefreshToken,
} from "../services/auth.service";

const router = Router();

const SALT_ROUNDS = 12;

// ---------- Shared Helpers ----------

// Unified select for consistent user responses
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
};

// Serialize Prisma result -> flattened JSON
const serializeUser = (user: any) => ({
  ...user,
  interestTags: (user.interestTags ?? []).map((t: any) => t.name),
});

// Basic normalization helpers
const normalizePlain = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const normalizeEmail = (value: unknown): string =>
  normalizePlain(value).toLowerCase();

const validateEmail = (email: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// Build token pair response
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

// ---------- Register ----------
router.post("/register", async (req: Request, res: Response) => {
  const username = normalizePlain(req.body.username);
  const email = normalizeEmail(req.body.email);
  const password = typeof req.body.password === "string" ? req.body.password : "";

  if (!username || username.length < 3) {
    return res.status(400).json({ error: "Username must be at least 3 characters long" });
  }
  if (!email || !validateEmail(email)) {
    return res.status(400).json({ error: "A valid email address is required" });
  }
  if (!password || password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters long" });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const newUser = await prisma.user.create({
      data: { username, email, password: hashedPassword },
      select: baseUserSelect,
    });

    const tokens = buildAuthResponse(newUser);
    return res.status(201).json({
      ...tokens,
      user: serializeUser(newUser),
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return res.status(409).json({ error: "Username or email already exists" });
    }
    console.error("Register Error:", error);
    return res.status(500).json({ error: "Registration failed" });
  }
});

// ---------- Login ----------
router.post("/login", async (req: Request, res: Response) => {
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const identifierRaw = req.body.identifier ?? req.body.username ?? req.body.email;
  const identifier = normalizePlain(identifierRaw);

  if (!identifier) {
    return res.status(400).json({ error: "Username or email is required to log in" });
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
      select: { ...baseUserSelect, password: true, tokenVersion: true },
    });

    if (!user) {
      return res.status(404).json({ error: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const { password: _pw, ...safeUser } = user;
    const tokens = buildAuthResponse(user);

    return res.json({
      ...tokens,
      user: serializeUser(safeUser),
    });
  } catch (error) {
    console.error("Login Error:", error);
    return res.status(500).json({ error: "Login failed" });
  }
});

// ---------- Refresh ----------
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
      select: { ...baseUserSelect, tokenVersion: true },
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
      user: serializeUser(user),
    });
  } catch (error) {
    console.error("Refresh Error:", error);
    return res.status(401).json({ error: "Invalid or expired refresh token" });
  }
});

// ---------- Logout ----------
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

// ---------- Me ----------
router.get("/me", authenticate, async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: baseUserSelect,
    });

    if (!user) return res.status(404).json({ error: "User not found" });

    return res.json(serializeUser(user));
  } catch (error) {
    console.error("Profile Error:", error);
    return res.status(500).json({ error: "Failed to load profile" });
  }
});

export default router;
