import dotenv from "dotenv";

dotenv.config();

const DURATION_UNITS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 60 * 60,
  d: 60 * 60 * 24,
};

const parseDurationSeconds = (value: string, fallback: number): number => {
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }

  if (/^\d+$/.test(trimmed)) {
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric) && numeric >= 0) {
      return numeric;
    }
    throw new Error(`Invalid numeric duration: ${value}`);
  }

  const match = trimmed.match(/^(\d+)\s*([smhd])$/i);
  if (match) {
    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();
    return amount * DURATION_UNITS[unit];
  }

  throw new Error(`Unsupported duration format "${value}". Use numeric seconds or <number><s|m|h|d>.`);
};

const getString = (key: string, fallback: string): string => {
  const value = process.env[key];
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  return fallback;
};

const getDuration = (key: string, fallback: number): number => {
  const value = process.env[key];
  try {
    if (typeof value === "string" && value.trim().length > 0) {
      return parseDurationSeconds(value, fallback);
    }
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[env] ${error instanceof Error ? error.message : String(error)}`);
      return fallback;
    }
    throw error;
  }
  return fallback;
};

export const jwtConfig = {
  accessSecret: getString("JWT_ACCESS_SECRET", "dev-access-secret"),
  refreshSecret: getString("JWT_REFRESH_SECRET", "dev-refresh-secret"),
  issuer: getString("JWT_ISSUER", "f25-iron"),
  accessTtlSeconds: getDuration("JWT_ACCESS_TTL", 60 * 15), // 15 minutes
  refreshTtlSeconds: getDuration("JWT_REFRESH_TTL", 60 * 60 * 24 * 7), // 7 days
};

export type JwtConfig = typeof jwtConfig;
