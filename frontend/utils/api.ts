import { Platform } from "react-native";
import type { CurrentUser } from "../context/UserContext";

type FetchInput = Parameters<typeof fetch>[0];
export type AuthorizedRequestInit = RequestInit & { skipAuth?: boolean };
export type AuthorizedFetch = (input: FetchInput, init?: AuthorizedRequestInit) => Promise<Response>;

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  (Platform.OS === "android"
    ? "http://10.0.2.2:8000" // Android emulator
    : "http://localhost:8000"); // iOS simulator or web

type JsonRecord = Record<string, unknown>;

const normalizeString = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;

const normalizeOptionalString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const normalizeOptionalNumber = (value: unknown): number | undefined => {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
};

const normalizeOptionalBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
};

const normalizeStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }

  return result;
};

const parseUserId = (value: unknown): number => {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error("Invalid user payload: missing id");
  }
  return numeric;
};

// ✅ Helper: normalize relative /uploads path to full URL
const resolveProfilePictureUrl = (path: unknown): string | null => {
  if (typeof path !== "string" || path.trim() === "") return null;
  if (path.startsWith("http")) return path;
  return `${API_BASE_URL}${path}`;
};

// ✅ Updated user parser (includes trustScore + profilePicture)
export const toCurrentUser = (payload: JsonRecord): CurrentUser => ({
  id: parseUserId(payload.id),
  username:
    normalizeOptionalString(payload.username) ??
    normalizeOptionalString(payload.userName),
  email: normalizeString(payload.email),
  name: normalizeOptionalString(payload.name),
  createdAt: normalizeOptionalString(payload.createdAt),
  interestTags: normalizeStringArray(payload.interestTags),
  trustScore: normalizeOptionalNumber(payload.trustScore),
  profilePicture: resolveProfilePictureUrl(payload.profilePicture),
  visibility: normalizeOptionalBoolean(payload.visibility) ?? true,
});

const extractErrorMessage = async (response: Response): Promise<string> => {
  try {
    const data = (await response.json()) as JsonRecord | undefined;
    const message = normalizeString(data?.error);
    return message || `Request failed with status ${response.status}`;
  } catch {
    return `Request failed with status ${response.status}`;
  }
};

// ✅ Fetch logged-in user's profile
export const fetchProfile = async (accessToken: string): Promise<CurrentUser> => {
  const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
    headers: buildAuthHeaders(accessToken),
  });

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response));
  }

  const data = (await response.json()) as JsonRecord;
  return toCurrentUser(data);
};

// ✅ Fetch available tags
export const fetchTagCatalog = async (fetcher: AuthorizedFetch): Promise<string[]> => {
  const response = await fetcher(`${API_BASE_URL}/tags/catalog`);

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response));
  }

  const data = (await response.json()) as JsonRecord;
  const tags = normalizeStringArray(data?.tags);
  return tags.sort((a, b) => a.localeCompare(b));
};

export type UpdateUserProfilePayload = {
  name?: string | null;
  interestTags?: string[];
  visibility?: boolean;
  profilePicture?: string | null;
};

// ✅ Update user profile details (name, tags, etc.)
export const updateUserProfile = async (
  userId: number,
  payload: UpdateUserProfilePayload,
  fetcher: AuthorizedFetch
): Promise<CurrentUser> => {
  const body: Record<string, unknown> = {};

  if ("name" in payload) body.name = payload.name;
  if ("interestTags" in payload) body.interestTags = payload.interestTags;
  if ("visibility" in payload) body.visibility = payload.visibility;
  if ("profilePicture" in payload) body.profilePicture = payload.profilePicture;

  if (Object.keys(body).length === 0) {
    throw new Error("No profile fields provided.");
  }

  const response = await fetcher(`${API_BASE_URL}/users/${userId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response));
  }

  const data = (await response.json()) as JsonRecord;
  return toCurrentUser(data);
};

export const updateUserVisibility = async (
  visibility: boolean,
  fetcher: AuthorizedFetch
): Promise<CurrentUser> => {
  const response = await fetcher(`${API_BASE_URL}/users/me/visibility`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ visibility }),
  });

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response));
  }

  const data = (await response.json()) as JsonRecord;
  return toCurrentUser(data);
};

// ✅ Fetch any user by id (sanitized view for others)
export const fetchUserById = async (userId: number, accessToken?: string) => {
  const response = await fetch(`${API_BASE_URL}/users/${userId}`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response));
  }

  const data = (await response.json()) as Record<string, unknown>;
  // Reuse your robust normalizer:
  return toCurrentUser(data);
};