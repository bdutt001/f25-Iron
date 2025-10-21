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

type UserAuthRecord = {
  id: number;
  username: string;
  email: string | null;
  password: string;
  tokenVersion: number;
};

const userAuthSelect = {
  id: true,
  username: true,
  email: true,
  password: true,
  tokenVersion: true,
} satisfies Record<keyof UserAuthRecord, boolean>;

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
 * Build the authentication response containing tokens and user info.
 * @param user - The user record with authentication details.
 * @returns An object containing token type, access & refresh tokens, expiration info, and user data.
 */
const buildAuthResponse = (user: UserAuthRecord) => {
  const tokens = issueTokenPair(user);
  return {
    tokenType: tokens.tokenType,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresIn: tokens.expiresIn,
    refreshExpiresIn: tokens.refreshExpiresIn,
    user: toAuthenticatedUser({
      id: user.id,
      username: user.username,
      email: user.email,
    }),
  };
};

/**
 * Check if an error is a Prisma unique constraint violation.
 * @param error - The error object to check.
 * @returns True if the error is a Prisma unique constraint error; otherwise false.
 */
const handlePrismaUniqueError = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === "P2002";

/**
 * Validate the format of an email address.
 * @param email - The email string to validate.
 * @returns True if the email matches the regex pattern; otherwise false.
 */
const validateEmail = (email: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

/**
 * POST /register
 * Register a new user with username, email, and password.
 * Does not require authentication.
 * Returns 201 with auth tokens and user info on success.
 */
router.post("/register", async (req: Request, res: Response) => {
  // Extract and normalize input values
  const username = normalizePlain(req.body.username);
  const email = normalizeEmail(req.body.email);
  const password = typeof req.body.password === "string" ? req.body.password : "";

  // Validate username length
  if (!username || username.length < 3) {
    return res
      .status(400)
      .json({ error: "Username must be at least 3 characters long" });
  }

  // Validate email format
  if (!email || !validateEmail(email)) {
    return res.status(400).json({ error: "A valid email address is required" });
  }

  // Validate password length
  if (!password || password.length < 8) {
    return res
      .status(400)
      .json({ error: "Password must be at least 8 characters long" });
  }

  try {
    // Hash the password using bcrypt
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    // Create the user in the database
    const user = await prisma.user.create({
      data: {
        username,
        email,
        password: hashedPassword,
      },
      select: userAuthSelect,
    });

    // Respond with authentication tokens and user info
    return res.status(201).json(buildAuthResponse(user));
  } catch (error) {
    // Handle unique constraint violation (username/email already exists)
    if (handlePrismaUniqueError(error)) {
      return res.status(409).json({
        error: "Username or email already exists",
      });
    }

    // Log and respond with generic error
    console.error("Register Error:", error);
    return res.status(500).json({ error: "Registration failed" });
  }
});

/**
 * POST /login
 * Authenticate a user with username/email and password.
 * Does not require authentication.
 * Returns auth tokens and user info on success.
 */
router.post("/login", async (req: Request, res: Response) => {
  // Extract password and identifier from request body
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const identifierRaw =
    req.body.identifier ?? req.body.username ?? req.body.email;
  const identifier = normalizePlain(identifierRaw);

  // Validate presence of identifier
  if (!identifier) {
    return res
      .status(400)
      .json({ error: "Username or email is required to log in" });
  }

  // Validate presence of password
  if (!password) {
    return res.status(400).json({ error: "Password is required" });
  }

  // Determine whether identifier is an email or username
  const whereClause =
    identifier.includes("@") && validateEmail(identifier)
      ? { email: normalizeEmail(identifier) }
      : { username: identifier };

  try {
    // Find user by username or email
    const user = await prisma.user.findUnique({
      where: whereClause,
      select: userAuthSelect,
    });

    // If user not found, respond with invalid credentials
    if (!user) {
      return res.status(404).json({ error: "Invalid credentials" });
    }

    // Compare provided password with stored hashed password
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Respond with auth tokens and user info
    return res.json(buildAuthResponse(user));
  } catch (error) {
    // Log and respond with generic error
    console.error("Login Error:", error);
    return res.status(500).json({ error: "Login failed" });
  }
});

/**
 * POST /refresh
 * Refresh access tokens using a valid refresh token.
 * Does not require authentication.
 * Returns new auth tokens on success.
 */
router.post("/refresh", async (req: Request, res: Response) => {
  // Extract and trim refresh token from request body
  const refreshToken =
    typeof req.body.refreshToken === "string" ? req.body.refreshToken.trim() : "";

  // Validate presence of refresh token
  if (!refreshToken) {
    return res.status(400).json({ error: "Refresh token is required" });
  }

  try {
    // Verify and decode the refresh token payload
    const payload = verifyRefreshToken(refreshToken);
    const userId = Number(payload.sub);

    // Validate user ID in token payload
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({ error: "Invalid refresh token" });
    }

    // Fetch user from database
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: userAuthSelect,
    });

    // If user not found, respond with error
    if (!user) {
      return res.status(401).json({ error: "Account not found" });
    }

    // Check token version to invalidate old tokens
    if (payload.tokenVersion !== user.tokenVersion) {
      return res.status(401).json({ error: "Refresh token is no longer valid" });
    }

    // Respond with new auth tokens and user info
    return res.json(buildAuthResponse(user));
  } catch (error) {
    // Log and respond with invalid or expired token error
    console.error("Refresh Error:", error);
    return res.status(401).json({ error: "Invalid or expired refresh token" });
  }
});

/**
 * POST /logout
 * Log out the authenticated user by invalidating their sessions.
 * Requires authentication.
 * Returns 204 No Content on success.
 */
router.post("/logout", authenticate, async (req: Request, res: Response) => {
  const userId = req.user?.id;

  // Ensure user is authenticated
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // Invalidate all sessions for the user (e.g., increment token version)
    await invalidateUserSessions(userId);
  } catch (error) {
    // Log and respond with failure to log out
    console.error("Logout Error:", error);
    return res.status(500).json({ error: "Failed to log out" });
  }

  // Respond with no content status
  return res.status(204).send();
});

/**
 * GET /me
 * Retrieve the authenticated user's profile information.
 * Requires authentication.
 * Returns user profile data including interest tags.
 */
router.get("/me", authenticate, async (req: Request, res: Response) => {
  const userId = req.user?.id;

  // Ensure user is authenticated
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // Fetch user profile including interest tags and other fields
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        status: true,
        interestTags: { select: { name: true } },
        profilePicture: true,
        visibility: true,
        createdAt: true,
      },
    });

    // If user not found, respond accordingly
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Map interest tags to simple array of tag names
    return res.json({
      ...user,
      interestTags: user.interestTags.map((tag) => tag.name),
    });
  } catch (error) {
    // Log and respond with failure to load profile
    console.error("Profile Error:", error);
    return res.status(500).json({ error: "Failed to load profile" });
  }
});

export default router;
