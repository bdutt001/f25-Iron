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

// --- ROUTER SETUP ---

// Initialize an Express router to define authentication-related routes
const router = Router();

// --- TYPE DEFINITIONS ---

// Define the shape of a user authentication record as expected from the database
type UserAuthRecord = {
  id: number;
  username: string;
  email: string | null;
  password: string;
  tokenVersion: number;
};

// Define the fields to select from the user model when querying for authentication purposes
const userAuthSelect = {
  id: true,
  username: true,
  email: true,
  password: true,
  tokenVersion: true,
} satisfies Record<keyof UserAuthRecord, boolean>;

// --- CONSTANTS ---

// Number of rounds to use when hashing passwords with bcrypt
const SALT_ROUNDS = 12;

// --- HELPER FUNCTIONS ---

/**
 * Normalize a value to a trimmed string.
 * If the input is not a string, returns an empty string.
 * This ensures consistent processing of user input.
 */
const normalizePlain = (value: unknown): string => {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
};

/**
 * Normalize an email address by trimming and converting to lowercase.
 * This standardizes email input for consistent storage and comparison.
 */
const normalizeEmail = (value: unknown): string => {
  const plain = normalizePlain(value);
  return plain.toLowerCase();
};

/**
 * Build the authentication response object to send to the client.
 * This includes issuing a new token pair and returning user info.
 * @param user - The user record from the database.
 * @returns An object containing tokens and authenticated user info.
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
 * This helps identify if a username or email already exists during registration.
 * @param error - The error object thrown by Prisma.
 * @returns True if the error is a unique constraint violation, false otherwise.
 */
const handlePrismaUniqueError = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === "P2002";

/**
 * Validate the format of an email address using a regular expression.
 * This ensures emails conform to a basic valid pattern before processing.
 * @param email - The email string to validate.
 * @returns True if the email is valid, false otherwise.
 */
const validateEmail = (email: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// --- ROUTE HANDLERS ---

/**
 * POST /register
 * Register a new user with username, email, and password.
 * Validates input, hashes the password, creates the user in the database,
 * and returns authentication tokens and user info on success.
 */
router.post("/register", async (req: Request, res: Response) => {
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
    // Hash the password securely before storing
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    // Create the new user in the database
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
    // Handle unique constraint violations (duplicate username/email)
    if (handlePrismaUniqueError(error)) {
      return res.status(409).json({
        error: "Username or email already exists",
      });
    }

    // Log and return generic server error for other issues
    console.error("Register Error:", error);
    return res.status(500).json({ error: "Registration failed" });
  }
});

/**
 * POST /login
 * Authenticate a user by username/email and password.
 * Validates input, verifies credentials, and returns tokens and user info on success.
 */
router.post("/login", async (req: Request, res: Response) => {
  const password = typeof req.body.password === "string" ? req.body.password : "";
  // Accept identifier from multiple possible fields for flexibility
  const identifierRaw =
    req.body.identifier ?? req.body.username ?? req.body.email;
  const identifier = normalizePlain(identifierRaw);

  // Ensure identifier is provided
  if (!identifier) {
    return res
      .status(400)
      .json({ error: "Username or email is required to log in" });
  }

  // Ensure password is provided
  if (!password) {
    return res.status(400).json({ error: "Password is required" });
  }

  // Determine whether to search by email or username
  const whereClause =
    identifier.includes("@") && validateEmail(identifier)
      ? { email: normalizeEmail(identifier) }
      : { username: identifier };

  try {
    // Find the user record by identifier
    const user = await prisma.user.findUnique({
      where: whereClause,
      select: userAuthSelect,
    });

    // If user not found, return error
    if (!user) {
      return res.status(404).json({ error: "Invalid credentials" });
    }

    // Compare provided password with stored hashed password
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Return authentication tokens and user info
    return res.json(buildAuthResponse(user));
  } catch (error) {
    // Log and return generic server error on failure
    console.error("Login Error:", error);
    return res.status(500).json({ error: "Login failed" });
  }
});

/**
 * POST /refresh
 * Refresh authentication tokens using a valid refresh token.
 * Validates the refresh token, checks token version for revocation,
 * and issues new tokens if valid.
 */
router.post("/refresh", async (req: Request, res: Response) => {
  const refreshToken =
    typeof req.body.refreshToken === "string" ? req.body.refreshToken.trim() : "";

  // Ensure refresh token is provided
  if (!refreshToken) {
    return res.status(400).json({ error: "Refresh token is required" });
  }

  try {
    // Verify the refresh token and extract payload
    const payload = verifyRefreshToken(refreshToken);
    const userId = Number(payload.sub);

    // Validate user ID extracted from token
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({ error: "Invalid refresh token" });
    }

    // Retrieve user from database
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: userAuthSelect,
    });

    // If user not found, reject the refresh request
    if (!user) {
      return res.status(401).json({ error: "Account not found" });
    }

    // Check if token version matches to detect revoked tokens
    if (payload.tokenVersion !== user.tokenVersion) {
      return res.status(401).json({ error: "Refresh token is no longer valid" });
    }

    // Issue new tokens and return user info
    return res.json(buildAuthResponse(user));
  } catch (error) {
    // Log and return error if token is invalid or expired
    console.error("Refresh Error:", error);
    return res.status(401).json({ error: "Invalid or expired refresh token" });
  }
});

/**
 * POST /logout
 * Log out the authenticated user by invalidating their sessions.
 * Requires authentication middleware to verify user identity.
 */
router.post("/logout", authenticate, async (req: Request, res: Response) => {
  const userId = req.user?.id;

  // Ensure the request is authenticated
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // Invalidate all sessions for the user (e.g., increment tokenVersion)
    await invalidateUserSessions(userId);
  } catch (error) {
    // Log and return error if logout fails
    console.error("Logout Error:", error);
    return res.status(500).json({ error: "Failed to log out" });
  }

  // Return 204 No Content to indicate successful logout with no response body
  return res.status(204).send();
});

/**
 * GET /me
 * Retrieve the authenticated user's profile information.
 * Requires authentication middleware to verify user identity.
 */
router.get("/me", authenticate, async (req: Request, res: Response) => {
  const userId = req.user?.id;

  // Ensure the request is authenticated
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // Fetch user profile details from the database
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        status: true,
        interestTags: true,
        profilePicture: true,
        visibility: true,
        createdAt: true,
      },
    });

    // If user not found, return 404 error
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Return user profile data
    return res.json(user);
  } catch (error) {
    // Log and return error if profile retrieval fails
    console.error("Profile Error:", error);
    return res.status(500).json({ error: "Failed to load profile" });
  }
});

// Export the router to be used in the main application
export default router;
