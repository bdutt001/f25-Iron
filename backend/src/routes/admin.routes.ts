import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { requireAdmin } from "../middleware/requireAdmin";
import prisma from "../prisma";

const router = Router();

/*
Currently doesnt work as intended.
Might delete
*/
console.log("authenticate import:", authenticate, "type:", typeof authenticate);
console.log("requireAdmin import:", requireAdmin, "type:", typeof requireAdmin);

router.get("/admin/reports", authenticate, requireAdmin, async (req, res) => {
  const reports = await prisma.report.findMany({
    orderBy: { createdAt: "desc" },
    include: { reporter: true, reported: true },
  });
  res.json(reports);
});

export default router;