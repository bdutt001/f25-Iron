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

export default router;
