import { decodeJwt, signJwt, verifyJwt } from "../../../src/utils/jwt";

describe("utils/jwt", () => {
  const secret = "unit-secret";
  const baseDate = new Date("2025-03-01T00:00:00Z");

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(baseDate);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("signs and verifies JWTs with issuer/subject/expiration", () => {
    const token = signJwt({ role: "user" }, secret, {
      subject: 123,
      issuer: "unit",
      expiresInSeconds: 60,
    });

    expect(token.split(".")).toHaveLength(3);

    const payload = verifyJwt(token, secret);
    expect(payload.role).toBe("user");
    expect(payload.sub).toBe("123");
    expect(payload.iss).toBe("unit");
    expect(payload.iat).toBe(Math.floor(baseDate.getTime() / 1000));
    expect(payload.exp).toBe(payload.iat + 60);
  });

  it("throws when verifying with a different secret", () => {
    const token = signJwt({}, secret);
    expect(() => verifyJwt(token, "wrong"))
      .toThrow("Token signature mismatch.");
  });

  it("throws when the token is expired", () => {
    const token = signJwt({}, secret, { expiresInSeconds: 10 });
    jest.setSystemTime(new Date(baseDate.getTime() + 20000));
    expect(() => verifyJwt(token, secret)).toThrow("Token has expired.");
  });

  it("decodes payload without verifying signature", () => {
    const token = signJwt({ foo: "bar" }, secret);
    expect(decodeJwt(token)).toMatchObject({ foo: "bar" });
  });

  it("throws if secret is missing when signing or verifying", () => {
    expect(() => signJwt({}, "" as unknown as string)).toThrow(
      "JWT secret is required to sign tokens."
    );

    const token = signJwt({}, secret);
    expect(() => verifyJwt(token, "" as unknown as string)).toThrow(
      "JWT secret is required to verify tokens."
    );
  });
});
