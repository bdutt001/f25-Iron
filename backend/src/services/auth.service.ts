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

export const verifyRefreshToken = (token: string): AuthTokenPayload =>
  verifyJwt<AuthTokenPayload>(token, jwtConfig.refreshSecret);

export const toAuthenticatedUser = (
  user: Pick<AuthenticatedUser, "id" | "username" | "email">
): AuthenticatedUser => ({
  id: user.id,
  username: user.username,
  email: user.email,
});

export const invalidateUserSessions = async (userId: number) => {
  await prisma.user.update({
    where: { id: userId },
    data: {
      tokenVersion: { increment: 1 },
    },
  });
};
