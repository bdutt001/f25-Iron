import { Platform } from "react-native";
import type { CurrentUser } from "../context/UserContext";

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

// ✅ Updated user parser (includes profilePicture)
export const toCurrentUser = (payload: JsonRecord): CurrentUser => ({
  id: parseUserId(payload.id),
  username:
    normalizeOptionalString(payload.username) ??
    normalizeOptionalString(payload.userName),
  email: normalizeString(payload.email),
  name: normalizeOptionalString(payload.name),
  createdAt: normalizeOptionalString(payload.createdAt),
  interestTags: normalizeStringArray(payload.interestTags),
  profilePicture: resolveProfilePictureUrl(payload.profilePicture), // ✅ new line
});

const buildAuthHeaders = (token: string): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
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
  const response = await fetch(`${API_BASE_URL}/auth/me`, {
    headers: buildAuthHeaders(accessToken),
  });

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response));
  }

  const data = (await response.json()) as JsonRecord;
  return toCurrentUser(data);
};

// ✅ Fetch available tags
export const fetchTagCatalog = async (accessToken: string): Promise<string[]> => {
  const response = await fetch(`${API_BASE_URL}/tags/catalog`, {
    headers: buildAuthHeaders(accessToken),
  });

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response));
  }

  const data = (await response.json()) as JsonRecord;
  const tags = normalizeStringArray(data?.tags);
  return tags.sort((a, b) => a.localeCompare(b));
};

// ✅ Update user's interest tags
export const updateUserInterestTags = async (
  userId: number,
  tags: string[],
  accessToken: string
): Promise<CurrentUser> => {
  const response = await fetch(`${API_BASE_URL}/users/${userId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(accessToken),
    },
    body: JSON.stringify({ interestTags: tags }),
  });

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response));
  }

  const data = (await response.json()) as JsonRecord;
  return toCurrentUser(data);
};
