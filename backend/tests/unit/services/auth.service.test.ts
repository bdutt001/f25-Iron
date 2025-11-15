import prisma from "../../../src/prisma";
import {
  buildTokenPayload,
  issueTokenPair,
  toAuthenticatedUser,
  verifyRefreshToken,
  invalidateUserSessions,
  type AuthTokenPayload,
} from "../../../src/services/auth.service";
import { decodeJwt } from "../../../src/utils/jwt";

jest.mock("../../../src/config/env", () => ({
  jwtConfig: {
    accessSecret: "unit-test-access",
    refreshSecret: "unit-test-refresh",
    issuer: "unit-test-issuer",
    accessTtlSeconds: 900,
    refreshTtlSeconds: 604800,
  },
}));

jest.mock("../../../src/prisma", () => ({
  __esModule: true,
  default: {
    user: {
      update: jest.fn(),
    },
  },
}));

describe("auth.service", () => {
  const baseUser = {
    id: 42,
    email: "alice@example.com",
    name: "Alice",
    tokenVersion: 1,
  };

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2025-01-01T00:00:00.000Z"));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it("builds the expected token payload", () => {
    expect(buildTokenPayload(baseUser)).toEqual({
      email: baseUser.email,
      name: baseUser.name,
      tokenVersion: baseUser.tokenVersion,
    });
  });

  it("issues a token pair using the configured TTLs", () => {
    const result = issueTokenPair(baseUser);

    expect(result.tokenType).toBe("Bearer");
    expect(result.expiresIn).toBe(900);
    expect(result.refreshExpiresIn).toBe(604800);

    const decodedAccess = decodeJwt<AuthTokenPayload>(result.accessToken);
    const decodedRefresh = decodeJwt<AuthTokenPayload>(result.refreshToken);

    expect(decodedAccess.sub).toBe(String(baseUser.id));
    expect(decodedAccess.iss).toBe("unit-test-issuer");
    expect(decodedAccess.exp).toBe(decodedAccess.iat + 900);

    expect(decodedRefresh.sub).toBe(String(baseUser.id));
    expect(decodedRefresh.exp).toBe(decodedRefresh.iat + 604800);
  });

  it("verifies refresh tokens with the correct secret", () => {
    const { refreshToken } = issueTokenPair(baseUser);
    const payload = verifyRefreshToken(refreshToken);
    expect(payload.sub).toBe(String(baseUser.id));
    expect(payload.tokenVersion).toBe(baseUser.tokenVersion);
  });

  it("normalizes authenticated user output", () => {
    const rawUser = {
      id: 1,
      email: "raw@example.com",
      name: null,
      profilePicture: undefined,
      interestTags: [{ name: "Outdoors" }, "Music"],
      visibility: undefined,
    };

    expect(toAuthenticatedUser(rawUser)).toEqual({
      id: 1,
      email: "raw@example.com",
      name: null,
      profilePicture: null,
      interestTags: ["Outdoors", "Music"],
      visibility: false,
    });
  });

  it("invalidates sessions by bumping the token version", async () => {
    const mockedPrisma = prisma as jest.Mocked<typeof prisma>;
    await invalidateUserSessions(baseUser.id);
    expect(mockedPrisma.user.update).toHaveBeenCalledWith({
      where: { id: baseUser.id },
      data: { tokenVersion: { increment: 1 } },
    });
  });
});
