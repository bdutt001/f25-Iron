import { ReportStatus } from "@prisma/client";
import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { requireAdmin } from "../middleware/requireAdmin";
import prisma from "../prisma";

const router = Router();

const userSelect = {
  id: true,
  email: true,
  name: true,
  trustScore: true,
  banned: true,
  bannedAt: true,
  banReason: true,
} as const;

const normalizeStatuses = (raw: unknown): ReportStatus[] | null => {
  if (!raw) return null;
  const values = Array.isArray(raw) ? raw : String(raw).split(",");
  const valid = values
    .map((v) => String(v).trim().toUpperCase())
    .filter((v) => (Object.values(ReportStatus) as string[]).includes(v)) as ReportStatus[];
  return valid.length ? valid : null;
};

const toNumberOrNull = (value: unknown): number | null => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
};

router.get("/admin/reports", authenticate, requireAdmin, async (req, res) => {
  const statuses = normalizeStatuses(req.query.status);
  const order = req.query.order === "asc" ? "asc" : "desc";
  try {
    const reports = await prisma.report.findMany({
      where: statuses ? { status: { in: statuses } } : undefined,
      include: {
        reporter: { select: userSelect },
        reported: { select: userSelect },
        lastModerator: { select: { id: true, email: true, name: true } },
      },
      orderBy: { createdAt: order },
    });

    res.json(reports);
  } catch (error) {
    console.error("Failed to fetch admin reports:", error);
    res.status(500).json({ error: "Failed to fetch reports" });
  }
});

router.get("/admin/reports/:id", authenticate, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid report id" });
  }

  try {
    const report = await prisma.report.findUnique({
      where: { id },
      include: {
        reporter: { select: userSelect },
        reported: { select: userSelect },
        lastModerator: { select: { id: true, email: true, name: true } },
      },
    });

    if (!report) {
      return res.status(404).json({ error: "Report not found" });
    }

    const chat = await prisma.chatSession.findFirst({
      where: {
        AND: [
          { participants: { some: { userId: report.reporterId } } },
          { participants: { some: { userId: report.reportedId } } },
        ],
      },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          take: 50,
        },
      },
    });

    const messages = chat?.messages?.map((m) => ({
      id: m.id,
      content: m.content,
      senderId: m.senderId,
      chatSessionId: m.chatSessionId,
      createdAt: m.createdAt,
    })) ?? [];

    return res.json({ ...report, contextMessages: messages });
  } catch (error) {
    console.error("Failed to fetch admin report detail:", error);
    return res.status(500).json({ error: "Failed to fetch report" });
  }
});

router.patch("/admin/reports/:id/status", authenticate, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const rawStatus = typeof req.body.status === "string" ? req.body.status.trim().toUpperCase() : "";
  const note = typeof req.body.resolutionNote === "string" ? req.body.resolutionNote.trim() : null;
  if (!Object.values(ReportStatus).includes(rawStatus as ReportStatus)) {
    return res.status(400).json({ error: "Invalid status value" });
  }

  try {
    const updated = await prisma.report.update({
      where: { id },
      data: {
        status: rawStatus as ReportStatus,
        resolutionNote: note,
        lastModeratorId: req.user?.id ?? null,
      },
      include: {
        reporter: { select: userSelect },
        reported: { select: userSelect },
        lastModerator: { select: { id: true, email: true, name: true } },
      },
    });

    res.json(updated);
  } catch (error: any) {
    const isMissing = error?.code === "P2025";
    console.error("Failed to update report status:", error);
    res.status(isMissing ? 404 : 500).json({ error: isMissing ? "Report not found" : "Failed to update status" });
  }
});

router.patch("/admin/users/:id/trust", authenticate, requireAdmin, async (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: "Invalid user id" });
  }

  const hasDelta = typeof req.body.delta === "number";
  const hasSetTo = typeof req.body.setTo === "number";

  if (!hasDelta && !hasSetTo) {
    return res.status(400).json({ error: "Provide delta or setTo to adjust trust score" });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { trustScore: true } });
    if (!user) return res.status(404).json({ error: "User not found" });

    const current = Number.isFinite(user.trustScore) ? user.trustScore : 0;
    const nextRaw = hasSetTo ? Number(req.body.setTo) : current + Number(req.body.delta);
    const nextScore = Math.max(0, Math.min(100, Math.round(nextRaw)));

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { trustScore: nextScore },
      select: { trustScore: true },
    });

    return res.json(updated);
  } catch (error) {
    console.error("Failed to adjust trust score:", error);
    return res.status(500).json({ error: "Failed to adjust trust score" });
  }
});

router.post("/admin/users/:id/ban", authenticate, requireAdmin, async (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: "Invalid user id" });
  }

  const reason = typeof req.body.reason === "string" ? req.body.reason.trim() : null;

  try {
    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        banned: true,
        bannedAt: new Date(),
        banReason: reason,
        bannedByAdminId: req.user?.id ?? null,
      },
      select: {
        id: true,
        banned: true,
        bannedAt: true,
        banReason: true,
        bannedByAdminId: true,
      },
    });

    return res.json(updated);
  } catch (error: any) {
    const isMissing = error?.code === "P2025";
    console.error("Failed to ban user:", error);
    return res.status(isMissing ? 404 : 500).json({ error: isMissing ? "User not found" : "Failed to ban user" });
  }
});

router.post("/admin/users/:id/unban", authenticate, requireAdmin, async (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: "Invalid user id" });
  }

  try {
    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        banned: false,
        bannedAt: null,
        banReason: null,
        bannedByAdminId: null,
      },
      select: {
        id: true,
        banned: true,
        bannedAt: true,
        banReason: true,
      },
    });

    return res.json(updated);
  } catch (error: any) {
    const isMissing = error?.code === "P2025";
    console.error("Failed to unban user:", error);
    return res.status(isMissing ? 404 : 500).json({ error: isMissing ? "User not found" : "Failed to unban user" });
  }
});

router.get("/admin/users/banned", authenticate, requireAdmin, async (req, res) => {
  const limitRaw = toNumberOrNull(req.query.limit) ?? 50;
  const offsetRaw = toNumberOrNull(req.query.offset) ?? 0;
  const limit = Math.min(Math.max(limitRaw, 1), 200);
  const offset = Math.max(offsetRaw, 0);
  const search = typeof req.query.q === "string" ? req.query.q.trim() : "";

  const where = {
    banned: true,
    OR: search
      ? [
          { email: { contains: search, mode: "insensitive" as const } },
          { name: { contains: search, mode: "insensitive" as const } },
        ]
      : undefined,
  };

  try {
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          trustScore: true,
          banned: true,
          bannedAt: true,
          banReason: true,
          lastLogin: true,
          createdAt: true,
        },
        orderBy: { bannedAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.user.count({ where }),
    ]);

    return res.json({ users, total, limit, offset, query: search });
  } catch (error) {
    console.error("Failed to fetch banned users:", error);
    return res.status(500).json({ error: "Failed to fetch banned users" });
  }
});

router.get("/admin/dashboard/metrics", authenticate, requireAdmin, async (_req, res) => {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  try {
    const [
      totalUsers,
      activePast24Hours,
      newUsersPast7Days,
      bannedUsers,
      openReports,
      underReviewReports,
      resolvedLast7Days,
      avgTrustScore,
      bansLast7Days,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { lastLogin: { gte: dayAgo } } }),
      prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.user.count({ where: { banned: true } }),
      prisma.report.count({ where: { status: ReportStatus.NEEDS_REVIEW } }),
      prisma.report.count({ where: { status: ReportStatus.UNDER_REVIEW } }),
      prisma.report.count({
        where: {
          status: { in: [ReportStatus.RESOLVED_ACTION, ReportStatus.RESOLVED_NO_ACTION] },
          updatedAt: { gte: weekAgo },
        },
      }),
      prisma.user.aggregate({ _avg: { trustScore: true } }),
      prisma.user.count({ where: { banned: true, bannedAt: { gte: weekAgo } } }),
    ]);

    return res.json({
      totalUsers,
      activePast24Hours,
      newUsersPast7Days,
      bannedUsers,
      bansLast7Days,
      openReports,
      underReviewReports,
      resolvedLast7Days,
      averageTrustScore: avgTrustScore._avg.trustScore ?? null,
      generatedAt: now.toISOString(),
    });
  } catch (error) {
    console.error("Failed to fetch admin metrics:", error);
    return res.status(500).json({ error: "Failed to fetch dashboard metrics" });
  }
});

export default router;
