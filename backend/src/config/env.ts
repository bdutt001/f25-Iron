/**
 * This module loads and parses environment variables, providing helper utilities
 * to safely read string values and duration values (in seconds) from the environment.
 * It supports duration strings with units like seconds (s), minutes (m), hours (h), and days (d).
 */

import dotenv from "dotenv";

dotenv.config();

/**
 * Mapping of duration unit suffixes to their equivalent number of seconds.
 * Supported units:
 *  - s: seconds
 *  - m: minutes
 *  - h: hours
 *  - d: days
 */
const DURATION_UNITS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 60 * 60,
  d: 60 * 60 * 24,
};

/**
 * Parses a duration string and converts it to a number of seconds.
 * Supports numeric strings (e.g., "300") and strings with units (e.g., "5m", "2h").
 * 
 * @param value - The duration string to parse.
 * @param fallback - The fallback number of seconds to return if input is empty.
 * @returns The duration in seconds.
 * @throws Error if the format is invalid or unsupported.
 */
const parseDurationSeconds = (value: string, fallback: number): number => {
  const trimmed = value.trim();
  if (!trimmed) {
    // Return fallback if the string is empty or just whitespace.
    return fallback;
  }

  // Check if the string is a pure numeric value (e.g., "300")
  if (/^\d+$/.test(trimmed)) {
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric) && numeric >= 0) {
      return numeric;
    }
    throw new Error(`Invalid numeric duration: ${value}`);
  }

  // Match strings with a number followed by an optional whitespace and a unit character
  const match = trimmed.match(/^(\d+)\s*([smhd])$/i);
  if (match) {
    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();
    return amount * DURATION_UNITS[unit];
  }

  // If format is not recognized, throw an error with usage guidance.
  throw new Error(`Unsupported duration format "${value}". Use numeric seconds or <number><s|m|h|d>.`);
};

/**
 * Retrieves a string environment variable by key, returning a fallback if not set or empty.
 * 
 * @param key - The environment variable key to retrieve.
 * @param fallback - The fallback string to return if the key is not set or empty.
 * @returns The environment variable value or the fallback.
 */
const getString = (key: string, fallback: string): string => {
  const value = process.env[key];
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  return fallback;
};

/**
 * Retrieves a duration environment variable by key, parsing it into seconds.
 * Returns the fallback if the variable is not set, empty, or invalid.
 * Logs a warning in non-production environments on parsing errors.
 * 
 * @param key - The environment variable key to retrieve.
 * @param fallback - The fallback duration in seconds to return if the key is not set or invalid.
 * @returns The parsed duration in seconds or the fallback.
 * @throws Propagates errors in production environment.
 */
const getDuration = (key: string, fallback: number): number => {
  const value = process.env[key];
  try {
    if (typeof value === "string" && value.trim().length > 0) {
      return parseDurationSeconds(value, fallback);
    }
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      // Log parsing errors as warnings in development/testing environments
      console.warn(`[env] ${error instanceof Error ? error.message : String(error)}`);
      return fallback;
    }
    // In production, propagate the error to fail fast
    throw error;
  }
  return fallback;
};

/**
 * Configuration object for JWT settings loaded from environment variables.
 * Includes secrets, issuer, and token TTLs in seconds.
 */
export const jwtConfig = {
  accessSecret: getString("JWT_ACCESS_SECRET", "dev-access-secret"),
  refreshSecret: getString("JWT_REFRESH_SECRET", "dev-refresh-secret"),
  issuer: getString("JWT_ISSUER", "f25-iron"),
  accessTtlSeconds: getDuration("JWT_ACCESS_TTL", 60 * 15), // 15 minutes
  refreshTtlSeconds: getDuration("JWT_REFRESH_TTL", 60 * 60 * 24 * 7), // 7 days
};

export type JwtConfig = typeof jwtConfig;
