import { API_BASE_URL, type AuthorizedFetch } from "./api";

export const REPORT_STATUSES = ["NEEDS_REVIEW", "UNDER_REVIEW", "RESOLVED_ACTION", "RESOLVED_NO_ACTION"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export type AdminReportUser = {
  id: number;
  email?: string | null;
  name?: string | null;
  trustScore?: number | null;
  banned?: boolean;
  bannedAt?: string | null;
  banReason?: string | null;
};

export type AdminContextMessage = {
  id: number;
  content: string;
  senderId: number;
  chatSessionId?: number;
  createdAt: string;
};

export type AdminReportSummary = {
  id: number;
  reason: string;
  description?: string | null;
  contextNote?: string | null;
  status: ReportStatus;
  createdAt: string;
  updatedAt?: string;
  resolutionNote?: string | null;
  severity?: number | null;
  reporter: AdminReportUser;
  reported: AdminReportUser;
  lastModerator?: AdminReportUser;
};

export type AdminReportDetail = AdminReportSummary & {
  contextMessages: AdminContextMessage[];
};

export type BannedUser = {
  id: number;
  email?: string | null;
  name?: string | null;
  trustScore?: number | null;
  bannedAt?: string | null;
  banReason?: string | null;
  lastLogin?: string | null;
  createdAt?: string | null;
};

export type BannedUsersResponse = {
  users: BannedUser[];
  total: number;
  limit: number;
  offset: number;
  query?: string;
};

export type AdminDashboardMetrics = {
  totalUsers: number;
  activePast24Hours: number;
  newUsersPast7Days: number;
  bannedUsers: number;
  bansLast7Days: number;
  openReports: number;
  underReviewReports: number;
  resolvedLast7Days: number;
  averageTrustScore: number | null;
  generatedAt: string;
};

const parseNumber = (value: unknown): number | null => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
};

const parseStatus = (value: unknown): ReportStatus => {
  const raw = typeof value === "string" ? value.trim().toUpperCase() : "";
  return REPORT_STATUSES.includes(raw as ReportStatus) ? (raw as ReportStatus) : "NEEDS_REVIEW";
};

const parseUser = (raw: any): AdminReportUser => {
  const id = parseNumber(raw?.id);
  if (!id) throw new Error("Missing user id");
  return {
    id,
    email: typeof raw?.email === "string" ? raw.email : undefined,
    name: typeof raw?.name === "string" ? raw.name : undefined,
    trustScore: parseNumber(raw?.trustScore),
    banned: typeof raw?.banned === "boolean" ? raw.banned : undefined,
    bannedAt: typeof raw?.bannedAt === "string" ? raw.bannedAt : undefined,
    banReason: typeof raw?.banReason === "string" ? raw.banReason : undefined,
  };
};

const parseReportSummary = (raw: any): AdminReportSummary | null => {
  const id = parseNumber(raw?.id);
  if (!id || typeof raw !== "object") return null;
  try {
    return {
      id,
      reason: typeof raw?.reason === "string" ? raw.reason : "Report",
      description: typeof raw?.description === "string" ? raw.description : null,
      contextNote: typeof raw?.contextNote === "string" ? raw.contextNote : null,
      status: parseStatus(raw?.status),
      createdAt: typeof raw?.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
      updatedAt: typeof raw?.updatedAt === "string" ? raw.updatedAt : undefined,
      resolutionNote: typeof raw?.resolutionNote === "string" ? raw.resolutionNote : null,
      severity: parseNumber(raw?.severity),
      reporter: parseUser(raw?.reporter),
      reported: parseUser(raw?.reported),
      lastModerator: raw?.lastModerator ? parseUser(raw.lastModerator) : undefined,
    };
  } catch (error) {
    console.warn("Failed to normalize admin report:", error);
    return null;
  }
};

const parseContextMessages = (raw: any): AdminContextMessage[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const id = parseNumber(item?.id);
      const senderId = parseNumber(item?.senderId);
      if (!id || !senderId) return null;
      const createdAt =
        typeof item?.createdAt === "string"
          ? item.createdAt
          : new Date(item?.createdAt ?? Date.now()).toISOString();
      return {
        id,
        senderId,
        chatSessionId: parseNumber(item?.chatSessionId) ?? undefined,
        content: typeof item?.content === "string" ? item.content : "",
        createdAt,
      };
    })
    .filter((msg): msg is AdminContextMessage => !!msg)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
};

const extractErrorMessage = async (response: Response): Promise<string> => {
  try {
    const data = (await response.json()) as { error?: unknown };
    if (typeof data?.error === "string") return data.error;
  } catch {
    // fall through
  }
  return `Request failed (${response.status})`;
};

export const fetchAdminReports = async (
  fetcher: AuthorizedFetch,
  options?: { statuses?: ReportStatus[]; order?: "asc" | "desc" }
): Promise<AdminReportSummary[]> => {
  const params = new URLSearchParams();
  if (options?.statuses?.length) params.set("status", options.statuses.join(","));
  if (options?.order) params.set("order", options.order);
  const suffix = params.toString() ? `?${params.toString()}` : "";

  const response = await fetcher(`${API_BASE_URL}/api/admin/reports${suffix}`);
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response));
  }
  const payload = (await response.json()) as unknown;
  if (!Array.isArray(payload)) {
    throw new Error("Unexpected reports payload");
  }
  return payload
    .map((item) => parseReportSummary(item))
    .filter((item): item is AdminReportSummary => item !== null);
};

export const fetchAdminReportDetail = async (
  reportId: number,
  fetcher: AuthorizedFetch
): Promise<AdminReportDetail> => {
  const response = await fetcher(`${API_BASE_URL}/api/admin/reports/${reportId}`);
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response));
  }
  const payload = (await response.json()) as any;
  const summary = parseReportSummary(payload);
  if (!summary) throw new Error("Invalid report payload");
  return {
    ...summary,
    contextMessages: parseContextMessages(payload?.contextMessages),
  };
};

export const updateReportStatus = async (
  reportId: number,
  status: ReportStatus,
  fetcher: AuthorizedFetch,
  resolutionNote?: string | null
): Promise<AdminReportSummary> => {
  const response = await fetcher(`${API_BASE_URL}/api/admin/reports/${reportId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, resolutionNote: resolutionNote ?? undefined }),
  });
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response));
  }
  const payload = await response.json();
  const normalized = parseReportSummary(payload);
  if (!normalized) throw new Error("Failed to parse updated report");
  return normalized;
};

export const adjustTrustScore = async (
  userId: number,
  fetcher: AuthorizedFetch,
  options: { delta?: number; setTo?: number }
): Promise<number> => {
  const response = await fetcher(`${API_BASE_URL}/api/admin/users/${userId}/trust`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
  });
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response));
  }
  const data = (await response.json()) as { trustScore?: unknown };
  const score = parseNumber(data?.trustScore);
  if (score === null) throw new Error("Missing trust score in response");
  return score;
};

export const banUser = async (
  userId: number,
  fetcher: AuthorizedFetch,
  reason?: string
): Promise<{ banned: boolean; bannedAt: string | null; banReason: string | null }> => {
  const response = await fetcher(`${API_BASE_URL}/api/admin/users/${userId}/ban`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason: reason?.trim() || undefined }),
  });
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response));
  }
  const data = (await response.json()) as {
    banned?: boolean;
    bannedAt?: string | null;
    banReason?: string | null;
  };
  return {
    banned: data.banned ?? true,
    bannedAt: data.bannedAt ?? null,
    banReason: data.banReason ?? (reason ?? null),
  };
};

const parseBannedUser = (raw: any): BannedUser | null => {
  const id = parseNumber(raw?.id);
  if (!id) return null;
  return {
    id,
    email: typeof raw?.email === "string" ? raw.email : null,
    name: typeof raw?.name === "string" ? raw.name : null,
    trustScore: parseNumber(raw?.trustScore),
    bannedAt: typeof raw?.bannedAt === "string" ? raw.bannedAt : null,
    banReason: typeof raw?.banReason === "string" ? raw.banReason : null,
    lastLogin: typeof raw?.lastLogin === "string" ? raw.lastLogin : null,
    createdAt: typeof raw?.createdAt === "string" ? raw.createdAt : null,
  };
};

export const fetchBannedUsers = async (
  fetcher: AuthorizedFetch,
  options?: { query?: string; limit?: number; offset?: number }
): Promise<BannedUsersResponse> => {
  const params = new URLSearchParams();
  if (options?.query) params.set("q", options.query);
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.offset) params.set("offset", String(options.offset));
  const suffix = params.toString() ? `?${params.toString()}` : "";

  const response = await fetcher(`${API_BASE_URL}/api/admin/users/banned${suffix}`);
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response));
  }
  const payload = (await response.json()) as any;
  if (!payload || !Array.isArray(payload.users)) {
    throw new Error("Unexpected banned users payload");
  }
  return {
    users: payload.users
      .map((item: any) => parseBannedUser(item))
      .filter((user: BannedUser | null): user is BannedUser => user !== null),
    total: parseNumber(payload.total) ?? payload.users.length,
    limit: parseNumber(payload.limit) ?? options?.limit ?? payload.users.length ?? 0,
    offset: parseNumber(payload.offset) ?? options?.offset ?? 0,
    query: typeof payload.query === "string" ? payload.query : options?.query,
  };
};

export const unbanUser = async (
  userId: number,
  fetcher: AuthorizedFetch
): Promise<{ banned: boolean; bannedAt: string | null; banReason: string | null }> => {
  const response = await fetcher(`${API_BASE_URL}/api/admin/users/${userId}/unban`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response));
  }
  const data = (await response.json()) as { banned?: boolean; bannedAt?: string | null; banReason?: string | null };
  return {
    banned: data.banned ?? false,
    bannedAt: data.bannedAt ?? null,
    banReason: data.banReason ?? null,
  };
};

export const fetchAdminMetrics = async (
  fetcher: AuthorizedFetch
): Promise<AdminDashboardMetrics> => {
  const response = await fetcher(`${API_BASE_URL}/api/admin/dashboard/metrics`);
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response));
  }
  const payload = (await response.json()) as AdminDashboardMetrics;
  if (!payload || typeof payload.totalUsers !== "number") {
    throw new Error("Invalid metrics payload");
  }
  return payload;
};
