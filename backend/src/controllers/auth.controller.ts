import { Request, Response } from "express";
import prisma from "../prisma";

const DEFAULT_PASSWORD = process.env.DEFAULT_PASSWORD || "Password123";

// Unified select for returning safe user data
const safeSelect = {
  id: true,
  email: true,
  name: true,
  profilePicture: true, // ✅ included
  interestTags: { select: { name: true } }, // ✅ included
  createdAt: true,
} as const;

type SafeUserRecord = {
  id: number;
  email: string | null;
  name: string | null;
  profilePicture: string | null;
  interestTags?: { name: string }[];
  createdAt: Date;
};

// Helper to shape user data safely
const toSafeUser = (user: SafeUserRecord) => ({
  ...user,
  profilePicture: user.profilePicture ?? null,
  interestTags: (user.interestTags ?? []).map((tag) => tag.name),
});

// ---------- SIGNUP ----------
export const signup = async (req: Request, res: Response) => {
  try {
    const emailRaw = (req.body?.email ?? "") as string;
    const name = typeof req.body?.name === "string" ? req.body.name : undefined;
    const passwordRaw = (req.body?.password as string | undefined) || DEFAULT_PASSWORD;

    const email = emailRaw.trim().toLowerCase();
    if (!email) return res.status(400).json({ error: "Email is required" });

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: "Email already registered" });

    const userRecord = (await prisma.user.create({
      data: { email, name, password: passwordRaw },
      select: safeSelect,
    })) as SafeUserRecord;

    return res.status(201).json(toSafeUser(userRecord));
  } catch (err) {
    console.error("Signup error", err);
    return res.status(500).json({ error: "Failed to sign up" });
  }
};

// ---------- LOGIN ----------
export const login = async (req: Request, res: Response) => {
  try {
    const emailRaw = (req.body?.email ?? "") as string;
    const password = (req.body?.password ?? "") as string;

    const email = emailRaw.trim().toLowerCase();
    if (!email || !password)
      return res.status(400).json({ error: "Email and password are required" });

    const userRecord = (await prisma.user.findUnique({
      where: { email },
      select: { ...safeSelect, password: true } as any,
    })) as (SafeUserRecord & { password: string }) | null;

    if (!userRecord) return res.status(401).json({ error: "Invalid credentials" });

    if (userRecord.password !== password) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const { password: _p, ...safe } = userRecord;
    return res.json(toSafeUser(safe));
  } catch (err) {
    console.error("Login error", err);
    return res.status(500).json({ error: "Failed to login" });
  }
};
