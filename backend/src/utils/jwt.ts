import crypto from "crypto";

export interface SignJwtOptions {
  subject?: string | number;
  expiresInSeconds?: number;
  issuer?: string;
}

export interface JwtPayload extends Record<string, unknown> {
  sub?: string;
  iss?: string;
  iat: number;
  exp?: number;
}

type Header = {
  alg: "HS256";
  typ: "JWT";
};

const base64UrlEncode = (input: Buffer | string): string => {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buffer
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
};

const base64UrlDecode = (input: string): Buffer => {
  const pad = input.length % 4;
  const paddedInput =
    pad === 0 ? input : input.concat("====".slice(0, 4 - pad));
  const base64 = paddedInput.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64");
};

const createSignature = (message: string, secret: string): Buffer => {
  return crypto.createHmac("sha256", secret).update(message).digest();
};

const encodeHeaderPayload = (
  header: Header,
  payload: JwtPayload
): { headerSegment: string; payloadSegment: string } => {
  const headerSegment = base64UrlEncode(JSON.stringify(header));
  const payloadSegment = base64UrlEncode(JSON.stringify(payload));
  return { headerSegment, payloadSegment };
};

const buildJwtPayload = (
  payload: Record<string, unknown>,
  options: SignJwtOptions
): JwtPayload => {
  const secondsSinceEpoch = Math.floor(Date.now() / 1000);
  const result: JwtPayload = {
    ...payload,
    iat: secondsSinceEpoch,
  };

  if (options.subject !== undefined) {
    result.sub = String(options.subject);
  }

  if (options.issuer) {
    result.iss = options.issuer;
  }

  if (options.expiresInSeconds && options.expiresInSeconds > 0) {
    result.exp = secondsSinceEpoch + options.expiresInSeconds;
  }

  return result;
};

export const signJwt = (
  payload: Record<string, unknown>,
  secret: string,
  options: SignJwtOptions = {}
): string => {
  if (!secret) {
    throw new Error("JWT secret is required to sign tokens.");
  }

  const header: Header = { alg: "HS256", typ: "JWT" };
  const jwtPayload = buildJwtPayload(payload, options);
  const { headerSegment, payloadSegment } = encodeHeaderPayload(
    header,
    jwtPayload
  );
  const signature = createSignature(
    `${headerSegment}.${payloadSegment}`,
    secret
  );
  const signatureSegment = base64UrlEncode(signature);
  return `${headerSegment}.${payloadSegment}.${signatureSegment}`;
};

const parseToken = (token: string): [string, string, string] => {
  const segments = token.split(".");
  if (segments.length !== 3) {
    throw new Error("Invalid token format. Expected 3 segments.");
  }
  const [headerSegment, payloadSegment, signatureSegment] = segments;
  if (!headerSegment || !payloadSegment || !signatureSegment) {
    throw new Error("Malformed token payload.");
  }
  return [headerSegment, payloadSegment, signatureSegment];
};

const decodeHeader = (segment: string): Header => {
  try {
    const raw = base64UrlDecode(segment).toString("utf8");
    const parsed = JSON.parse(raw);
    if (parsed.alg !== "HS256" || parsed.typ !== "JWT") {
      throw new Error("Unsupported JWT header.");
    }
    return parsed as Header;
  } catch (error) {
    throw new Error("Unable to decode JWT header.");
  }
};

const decodePayload = (segment: string): JwtPayload => {
  try {
    const raw = base64UrlDecode(segment).toString("utf8");
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      throw new Error("Invalid JWT payload.");
    }

    return parsed as JwtPayload;
  } catch (error) {
    throw new Error("Unable to decode JWT payload.");
  }
};

export const verifyJwt = <T extends JwtPayload>(
  token: string,
  secret: string
): T => {
  if (!secret) {
    throw new Error("JWT secret is required to verify tokens.");
  }

  const [headerSegment, payloadSegment, signatureSegment] = parseToken(token);
  decodeHeader(headerSegment);

  const payload = decodePayload(payloadSegment);

  const message = `${headerSegment}.${payloadSegment}`;
  const expectedSignature = createSignature(message, secret);
  const providedSignature = base64UrlDecode(signatureSegment);

  if (
    expectedSignature.length !== providedSignature.length ||
    !crypto.timingSafeEqual(expectedSignature, providedSignature)
  ) {
    throw new Error("Token signature mismatch.");
  }

  if (typeof payload.exp === "number") {
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp <= now) {
      throw new Error("Token has expired.");
    }
  }

  return payload as T;
};

export const decodeJwt = <T extends JwtPayload>(token: string): T => {
  const [headerSegment, payloadSegment] = parseToken(token);
  decodeHeader(headerSegment);
  return decodePayload(payloadSegment) as T;
};
