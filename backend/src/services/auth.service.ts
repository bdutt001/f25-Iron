/**
 * Authentication Service
 *
 * This file provides core authentication utilities for issuing and verifying JWT tokens,
 * building token payloads, converting user objects, and invalidating user sessions.
 * It interacts with the database and JWT utilities to manage user authentication state.
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
  username?: string;
  email?: string | null;
  tokenVersion: number;
}

/**
 * Builds the payload object for a JWT token from a user object.
 * @param user - The user object containing id, username, email, and tokenVersion.
 * @returns An object representing the payload for JWT.
 */
export const buildTokenPayload = (user: {
  id: number;
  username: string;
  email: string | null;
  tokenVersion: number;
}): Record<string, unknown> => ({
  username: user.username,
  email: user.email,
  tokenVersion: user.tokenVersion,
});

/**
 * Issues a pair of JWT tokens (access and refresh) for the given user.
 * @param user - The user object containing id, username, email, and tokenVersion.
 * @returns An object containing the access token, refresh token, their expirations, and token type.
 */
export const issueTokenPair = (user: {
  id: number;
  username: string;
  email: string | null;
  tokenVersion: number;
}): TokenPair => {
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
 * @param token - The JWT refresh token string.
 * @returns The decoded AuthTokenPayload if the token is valid.
 * @throws If the token is invalid or expired.
 */
export const verifyRefreshToken = (token: string): AuthTokenPayload =>
  verifyJwt<AuthTokenPayload>(token, jwtConfig.refreshSecret);

/**
 * Converts a user object to an AuthenticatedUser object.
 * @param user - An object with id, username, and email properties.
 * @returns An AuthenticatedUser object.
 */
export const toAuthenticatedUser = (
  user: Pick<AuthenticatedUser, "id" | "username" | "email">
): AuthenticatedUser => ({
  id: user.id,
  username: user.username,
  email: user.email,
});

/**
 * Invalidates all sessions for the specified user by incrementing their tokenVersion.
 * @param userId - The user's unique identifier.
 * @returns A promise that resolves when the operation is complete.
 */
export const invalidateUserSessions = async (userId: number) => {
  await prisma.user.update({
    where: { id: userId },
    data: {
      tokenVersion: { increment: 1 },
    },
  });
};
