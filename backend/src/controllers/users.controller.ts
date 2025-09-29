import type { Prisma } from "@prisma/client";
import { Request, Response } from "express";
import prisma from "../prisma";

// Create a new user
export const createUser = async (req: Request, res: Response) => {
  const { email, name, password } = req.body;
  const parsedInterestTags = Array.isArray(req.body.interestTags)
    ? req.body.interestTags.map((tag: string) => tag.trim()).filter(Boolean)
    : undefined;
  if (!email) return res.status(400).json({ error: "Email is required" });
  if (!password) return res.status(400).json({ error: "Password is required" });

  try {
    const data: Prisma.UserCreateInput = {
      email,
      password,
    };
    if (typeof name === "string") data.name = name;
    if (parsedInterestTags) data.interestTags = parsedInterestTags;

    const user = await prisma.user.create({
      data,
      select: {
        id: true,
        email: true,
        name: true,
        interestTags: true,
        createdAt: true,
      },
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
      select: {
        id: true,
        email: true,
        name: true,
        interestTags: true,
        createdAt: true,
      },
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
      select: {
        id: true,
        email: true,
        name: true,
        interestTags: true,
        createdAt: true,
      },
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
  const parsedInterestTags = Array.isArray(req.body.interestTags)
    ? req.body.interestTags.map((tag: string) => tag.trim()).filter(Boolean)
    : undefined;
  if (!id) return res.status(400).json({ error: "User ID is required" });

  try {
    const data: Prisma.UserUpdateInput = {};
    if (typeof email === "string") data.email = email;
    if (typeof name === "string") data.name = name;
    if (parsedInterestTags) data.interestTags = parsedInterestTags;

    const user = await prisma.user.update({
      where: { id: Number(id) },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        interestTags: true,
        createdAt: true,
      },
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
