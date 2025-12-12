import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { rejectAdmin } from "../middleware/rejectAdmin";
import prisma from "../prisma";
import { applyTrustScoreDeduction, normalizeSeverity } from "../services/trust.service";

const router = Router();

/**
 * POST /api/report
 * Create a report and decrement the reported user's trust score.
 */
router.post("/report", authenticate, rejectAdmin, async (req, res) => {
  try {
    const reporter = req.user;
    if (!reporter) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const reportedId = Number(req.body.reportedId);
    if (!Number.isInteger(reportedId) || reportedId <= 0) {
      return res.status(400).json({ error: "reportedId must be a positive integer" });
    }

    if (reportedId === reporter.id) {
      return res.status(400).json({ error: "You cannot report yourself" });
    }

    const reasonRaw = typeof req.body.reason === "string" ? req.body.reason.trim() : "";
    if (!reasonRaw) {
      return res.status(400).json({ error: "reason is required" });
    }

    const contextNoteRaw =
      typeof req.body.contextNote === "string" ? req.body.contextNote.trim() : "";
    const contextNote =
      contextNoteRaw && contextNoteRaw.length > 0
        ? contextNoteRaw.slice(0, 1000)
        : undefined;

    const reportedUser = await prisma.user.findUnique({
      where: { id: reportedId },
      select: { id: true, trustScore: true },
    });

    if (!reportedUser) {
      return res.status(404).json({ error: "Reported user not found" });
    }

    const severity = normalizeSeverity(req.body.severity);
    const { nextScore } = applyTrustScoreDeduction(reportedUser.trustScore, severity);

    const [, updatedUser] = await prisma.$transaction([
      prisma.report.create({
        data: {
          reason: reasonRaw,
          contextNote,
          reporterId: reporter.id,
          reportedId,
          severity,
        },
      }),
      prisma.user.update({
        where: { id: reportedId },
        data: { trustScore: nextScore },
        select: { trustScore: true },
      }),
    ]);

    return res.status(201).json({ trustScore: updatedUser.trustScore });
  } catch (error) {
    console.error("Failed to submit report:", error);
    return res.status(500).json({ error: "Failed to submit report" });
  }
});

/**
 * GET /api/users/:id/trust
 * Fetch the latest trust score for a user.
 */
router.get("/users/:id/trust", async (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: "Invalid user id" });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { trustScore: true },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json({ trustScore: user.trustScore });
  } catch (error) {
    console.error("Failed to fetch trust score:", error);
    return res.status(500).json({ error: "Failed to fetch trust score" });
  }
});

export default router;
