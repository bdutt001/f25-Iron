import { Request, Response } from "express";
import prisma from "../prisma";

// Create a new report
export const createReport = async (req: Request, res: Response) => {
  const { reason, reporterId, reportedId } = req.body;
  
  // Validation
  if (!reason) return res.status(400).json({ error: "Reason is required" });
  if (!reporterId) return res.status(400).json({ error: "Reporter ID is required" });
  if (!reportedId) return res.status(400).json({ error: "Reported user ID is required" });
  
  // Prevent self-reporting
  if (reporterId === reportedId) {
    return res.status(400).json({ error: "Cannot report yourself" });
  }

  try {
    // Verify both users exist
    const [reporter, reported] = await Promise.all([
      prisma.user.findUnique({ where: { id: reporterId } }),
      prisma.user.findUnique({ where: { id: reportedId } })
    ]);

    if (!reporter) {
      return res.status(404).json({ error: "Reporter user not found" });
    }
    if (!reported) {
      return res.status(404).json({ error: "Reported user not found" });
    }

    // Create the report
    const report = await prisma.report.create({
      data: { 
        reason, 
        reporterId, 
        reportedId 
      },
      include: {
        reporter: {
          select: { id: true, name: true }
        },
        reported: {
          select: { id: true, name: true }
        }
      }
    });

    res.status(201).json(report);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create report" });
  }
};

// Get all reports
export const getReports = async (_req: Request, res: Response) => {
  try {
    const reports = await prisma.report.findMany({
      include: {
        reporter: {
          select: { id: true, email: true, name: true, trustScore: true, banned: true }
        },
        reported: {
          select: { id: true, email: true, name: true, trustScore: true, banned: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(reports);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch reports" });
  }
};

// Get reports by reported user ID
export const getReportsByUserId = async (req: Request, res: Response) => {
  const { userId } = req.params;
  const userIdNum = Number(userId);

  if (Number.isNaN(userIdNum)) {
    return res.status(400).json({ error: "Invalid user ID" });
  }

  try {
    const reports = await prisma.report.findMany({
      where: { reportedId: userIdNum },
      include: {
        reporter: {
          select: { id: true, email: true, name: true, trustScore: true, banned: true }
        },
        reported: {
          select: { id: true, email: true, name: true, trustScore: true, banned: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(reports);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch reports" });
  }
};

// Get reports made by a specific user
export const getReportsByReporter = async (req: Request, res: Response) => {
  const { reporterId } = req.params;
  const reporterIdNum = Number(reporterId);

  if (Number.isNaN(reporterIdNum)) {
    return res.status(400).json({ error: "Invalid reporter ID" });
  }

  try {
    const reports = await prisma.report.findMany({
      where: { reporterId: reporterIdNum },
      include: {
        reporter: {
          select: { id: true, email: true, name: true, trustScore: true, banned: true }
        },
        reported: {
          select: { id: true, email: true, name: true, trustScore: true, banned: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(reports);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch reports" });
  }
};

// Get a specific report by ID
export const getReportById = async (req: Request, res: Response) => {
  const { id } = req.params;
  const reportId = Number(id);

  if (Number.isNaN(reportId)) {
    return res.status(400).json({ error: "Invalid report ID" });
  }

  try {
    const report = await prisma.report.findUnique({
      where: { id: reportId },
      include: {
        reporter: {
          select: { id: true, email: true, name: true, trustScore: true, banned: true }
        },
        reported: {
          select: { id: true, email: true, name: true, trustScore: true, banned: true }
        }
      }
    });

    if (!report) {
      return res.status(404).json({ error: "Report not found" });
    }

    res.json(report);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch report" });
  }
};

// Delete a report
export const deleteReport = async (req: Request, res: Response) => {
  const { id } = req.params;
  const reportId = Number(id);

  if (Number.isNaN(reportId)) {
    return res.status(400).json({ error: "Invalid report ID" });
  }

  try {
    await prisma.report.delete({ where: { id: reportId } });
    res.status(204).send();
  } catch (err: any) {
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Report not found" });
    }
    console.error(err);
    res.status(500).json({ error: "Failed to delete report" });
  }
};
