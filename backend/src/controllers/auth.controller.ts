import { Request, Response } from "express";
import prisma from "../prisma";

const DEFAULT_PASSWORD = process.env.DEFAULT_PASSWORD || "Password123";

const safeSelect = {
  id: true,
  email: true,
  name: true,
  interestTags: true,
  createdAt: true,
} as const;

export const signup = async (req: Request, res: Response) => {
  try {
    const emailRaw = (req.body?.email ?? "") as string;
    const name = typeof req.body?.name === "string" ? req.body.name : undefined;
    const passwordRaw = (req.body?.password as string | undefined) || DEFAULT_PASSWORD;

    const email = emailRaw.trim().toLowerCase();
    if (!email) return res.status(400).json({ error: "Email is required" });

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: "Email already registered" });

    const user = await prisma.user.create({
      data: { email, name, password: passwordRaw },
      select: safeSelect,
    });
    return res.status(201).json(user);
  } catch (err) {
    console.error("Signup error", err);
    return res.status(500).json({ error: "Failed to sign up" });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const emailRaw = (req.body?.email ?? "") as string;
    const password = (req.body?.password ?? "") as string;

    const email = emailRaw.trim().toLowerCase();
    if (!email || !password) return res.status(400).json({ error: "Email and password are required" });

    const user = await prisma.user.findUnique({ where: { email }, select: { ...safeSelect, password: true } as any });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    if (user.password !== password) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Drop password from response
    const { password: _p, ...safe } = user as any;
    return res.json(safe);
  } catch (err) {
    console.error("Login error", err);
    return res.status(500).json({ error: "Failed to login" });
  }
};

