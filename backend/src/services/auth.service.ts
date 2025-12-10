/**
 * Authentication Service
 *
 * Provides utilities for issuing and verifying JWT tokens,
 * building payloads, converting user objects, and invalidating sessions.
 */
import prisma from "../prisma";
import { jwtConfig } from "../config/env";
import { signJwt, verifyJwt } from "../utils/jwt";
import type { AuthenticatedUser } from "../types/auth";
import type { JwtPayload } from "../utils/jwt";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
  tokenType: "Bearer";
}

export interface AuthTokenPayload extends JwtPayload {
  email?: string | null;
  name?: string | null;
  tokenVersion: number;
}

type TokenUser = {
  id: number;
  email: string | null;
  name?: string | null;
  tokenVersion: number;
};

/**
 * Builds the payload object for a JWT token from a user object.
 */
export const buildTokenPayload = (user: TokenUser): Record<string, unknown> => ({
  email: user.email,
  name: user.name,
  tokenVersion: user.tokenVersion,
});

/**
 * Issues a pair of JWT tokens (access + refresh) for the given user.
 */
export const issueTokenPair = (user: TokenUser): TokenPair => {
  const payload = buildTokenPayload(user);

  const accessToken = signJwt(payload, jwtConfig.accessSecret, {
    subject: user.id,
    issuer: jwtConfig.issuer,
    expiresInSeconds: jwtConfig.accessTtlSeconds,
  });

  const refreshToken = signJwt(payload, jwtConfig.refreshSecret, {
    subject: user.id,
    issuer: jwtConfig.issuer,
    expiresInSeconds: jwtConfig.refreshTtlSeconds,
  });

  return {
    accessToken,
    refreshToken,
    expiresIn: jwtConfig.accessTtlSeconds,
    refreshExpiresIn: jwtConfig.refreshTtlSeconds,
    tokenType: "Bearer",
  };
};

/**
 * Verifies a refresh token and returns its decoded payload.
 */
export const verifyRefreshToken = (token: string): AuthTokenPayload =>
  verifyJwt<AuthTokenPayload>(token, jwtConfig.refreshSecret);

/**
 * Converts a user object to an AuthenticatedUser object.
 * Includes support for profilePicture, interestTags, profileStatus, and lastLogin.
 */
export const toAuthenticatedUser = (user: {
  id: number;
  email?: string | null;
  name?: string | null;
  profilePicture?: string | null;
  interestTags?: { name: string }[];
  visibility?: boolean;
  profileStatus?: string | null;
  lastLogin?: Date | string | null;
}): AuthenticatedUser => ({
  id: user.id,
  email: user.email ?? null,
  name: user.name ?? null,
  profilePicture: user.profilePicture ?? null,
  interestTags: Array.isArray(user.interestTags)
    ? user.interestTags.map((t: any) =>
        typeof t === "string" ? t : t.name
      )
    : [],
  visibility: user.visibility ?? false,
  profileStatus: user.profileStatus ?? null,
  lastLogin:
    user.lastLogin instanceof Date
      ? user.lastLogin.toISOString()
      : user.lastLogin ?? null,
});

/**
 * Invalidates all sessions for the specified user by incrementing their tokenVersion.
 */
export const invalidateUserSessions = async (userId: number) => {
  await prisma.user.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } },
  });
};
