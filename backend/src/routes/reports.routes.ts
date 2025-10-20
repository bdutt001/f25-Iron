import { Router } from "express";
import {
  createReport,
  getReports,
  getReportsByUserId,
  getReportsByReporter,
  getReportById,
  deleteReport,
} from "../controllers/reports.controller";

const router = Router();

// Routes
router.post("/reports", createReport);
router.get("/reports", getReports);
router.get("/reports/:id", getReportById); 
router.get("/reports/user/:userId", getReportsByUserId);
router.get("/reports/reporter/:reporterId", getReportsByReporter);
router.delete("/reports/:id", deleteReport);

export default router;