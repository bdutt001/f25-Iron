import { Request, Response } from "express";
import prisma from "../prisma";

// Create a new user
export const createUser = async (req: Request, res: Response) => {
  const { email, name, password } = req.body;
  if (!email) return res.status(400).json({ error: "Email is required" });
  if (!password) return res.status(400).json({ error: "Password is required" });

  try {
    const user = await prisma.user.create({
      data: { email, name, password },
      select: { id: true, email: true, name: true, createdAt: true },
    });
    res.status(201).json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create user" });
  }
};

// Get all users
export const getUsers = async (_req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, name: true, createdAt: true },
    });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
};

// Get one user by ID
export const getUserById = async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = Number(id);

  if (Number.isNaN(userId)) {
    return res.status(400).json({ error: "User not found" });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, createdAt: true },
    });
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch user" });
  }
};

// Update a user
export const updateUser = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { email, name } = req.body;
  if (!id) return res.status(400).json({ error: "User ID is required" });

  try {
    const user = await prisma.user.update({
      where: { id: Number(id) },
      data: { email, name },
      select: { id: true, email: true, name: true, createdAt: true },
    });
    res.json(user);
  } catch (err: any) {
    if (err.code === "P2025") {
      return res.status(404).json({ error: "User not found" });
    }
    console.error(err);
    res.status(500).json({ error: "Failed to update user" });
  }
};

// Delete a user
export const deleteUser = async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = Number(id);

  if (Number.isNaN(userId)) {
    return res.status(400).json({ error: "User not found" });
  }

  try {
    await prisma.user.delete({ where: { id: userId } });
    res.status(204).send();
  } catch (err: any) {
    if (err.code === "P2025") {
      return res.status(404).json({ error: "User not found" });
    }
    console.error(err);
    res.status(500).json({ error: "Failed to delete user" });
  }
};
