import { Request, Response, NextFunction } from "express";

/**
 * Blocks admin actors from using user-facing functionality.
 * Admin accounts share the same table but must not behave like end users.
 */
export const rejectAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (req.user?.isAdmin) {
    return res.status(403).json({ error: "Admin accounts cannot use normal user features." });
  }

  return next();
};

export default rejectAdmin;
