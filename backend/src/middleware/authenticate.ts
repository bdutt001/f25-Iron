/**
 * Express middleware for authenticating requests using JWT tokens.
 * - Validates the presence and format of a Bearer token in the Authorization header.
 * - Verifies and decodes the JWT, ensuring it is valid and not expired.
 * - Looks up the corresponding user in the database and checks the token version.
 * - Attaches authenticated user information to the request and response objects for downstream handlers.
 * - Responds with appropriate errors if validation or authentication fails.
 */
import { NextFunction, Request, Response } from "express";
import { jwtConfig } from "../config/env";
import prisma from "../prisma";
import { verifyJwt } from "../utils/jwt";
import type { JwtPayload } from "../utils/jwt";
import type { AuthenticatedUser } from "../types/auth";

// Interface describing the expected payload fields in the authentication JWT token
interface AuthTokenPayload extends JwtPayload {
  email?: unknown;
  name?: unknown;
  tokenVersion?: unknown;
}

// Helper to construct an AuthenticatedUser object from a user record
const buildUserFromRecord = (record: {
  id: number;
  email: string | null;
  name: string | null;
  profilePicture: string | null;
  visibility: boolean | null;
}): AuthenticatedUser => ({
  id: record.id,
  email: record.email,
  name: record.name,
  profilePicture: record.profilePicture,
  visibility: record.visibility ?? true,
});

// Express middleware to authenticate requests using JWT
export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  // 1. Check for Authorization header and Bearer token
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
    // 2. Verify the JWT token and decode its payload
    payload = verifyJwt<AuthTokenPayload>(token, jwtConfig.accessSecret);
  } catch (error) {
    console.error("JWT verification failed:", error);
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  // 3. Validate the decoded payload (subject should be a string)
  if (typeof payload.sub !== "string") {
    return res.status(401).json({ error: "Invalid token subject" });
  }

  const userId = Number(payload.sub);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(401).json({ error: "Invalid token subject" });
  }

  try {
    // 4. Look up the user in the database using the ID from the token subject
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        profilePicture: true,
        visibility: true,
        tokenVersion: true,
      },
    });

    // 5. Check if user exists
    if (!user) {
      return res.status(401).json({ error: "Account not found" });
    }

    // 6. Check if token version matches (for session invalidation)
    if (typeof payload.tokenVersion !== "number" || payload.tokenVersion !== user.tokenVersion) {
      return res.status(401).json({ error: "Session is no longer valid" });
    }

    // 7. Attach authenticated user and token payload to request and response objects
    const authUser = buildUserFromRecord(user);
    req.tokenPayload = payload;
    req.user = authUser;
    res.locals.user = authUser;
  } catch (error) {
    // 8. Handle errors during user lookup or validation
    console.error("Failed to perform authentication lookup:", error);
    return res.status(500).json({ error: "Failed to validate session" });
  }

  // 9. Proceed to the next middleware/handler
  return next();
};
