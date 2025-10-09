import type { Prisma } from "@prisma/client";
import bcrypt from "bcrypt";
import { Request, Response } from "express";
import prisma from "../prisma";
import { getAllUsers, addTagToUser, findUsersByTag } from "../services/users.services";

// Create a new user
export const createUser = async (req: Request, res: Response) => {
  const { email, name } = req.body;
  const password: string | undefined = req.body?.password;
  const defaultPassword = process.env.DEFAULT_PASSWORD || "Password123";
  const parsedInterestTags = Array.isArray(req.body.interestTags)
    ? req.body.interestTags.map((tag: string) => tag.trim()).filter(Boolean)
    : undefined;
  if (!email) return res.status(400).json({ error: "Email is required" });
  // Temporarily allow default plaintext password if none provided

  try {
    const passwordToHash = (password ?? defaultPassword) as string;
    const hashedPassword = await bcrypt.hash(passwordToHash, 10);

    const data: Prisma.UserCreateInput = {
      email,
      password: hashedPassword,
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
    if (typeof req.body.password === "string" && req.body.password.trim()) {
      data.password = await bcrypt.hash(req.body.password, 10);
    }

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

// List all user: GET /api/users
export const listUsers = async (_req: Request, res: Response) => {
  try {
    const users = await getAllUsers();
    res.json(users);
  } catch (error) {
    console.error("Error listing users:", error);
    res.status(500).json({ error: "Failed to list users" });
  }
};

// Add tag to a specific user: POST /api/users/:id/tags
export const addTag = async (req: Request, res: Response) => {
  try {
    const userId = Number(req.params.id);
    const { tagName } = req.body;

    if (!tagName) {
      return res.status(400).json({ error: "tagName is required" });
    }

    const user = await addTagToUser(userId, tagName);
    res.json(user);
  } catch (error) {
    console.error("Error adding tag to user:", error);
    res.status(500).json({ error: "Failed to add tag to user" });
  }
};

// Look for Users with a tag: GET /api/users/tags/:tagName
export const getUsersByTag = async (req: Request, res: Response) => {
  try {
    const tagName = req.params.tagName;

    if (!tagName) {
      return res.status(400).json({ error: "tagName parameter is required" });
    }

    const users = await findUsersByTag(tagName);
    res.json(users);
  } catch (error) {
    console.error("Error finding users by tag:", error);
    res.status(500).json({ error: "Failed to find users by tag" });
  }
};
//Remove a tag from a user: DELETE /api/users/:id/tags/:tagName
export const deleteTagFromUser = async (req: Request, res: Response) => {
  try {
    const userId = Number(req.params.id);
    const { tagName } = req.body;

    if (Number.isNaN(userId)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }
    if (!tagName) {
      return res.status(400).json({ error: "tagName is required" });
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        tags: {
          disconnect: { name: tagName }, // remove the relation
        },
      },
      include: { tags: true }, // return updated user with tags
    });

    res.json(user);
  } catch (error: any) {
    console.error("Error removing tag from user:", error);
    if (error.code === "P2025") {
      return res.status(404).json({ error: "User or tag not found" });
    }
    res.status(500).json({ error: "Failed to remove tag from user" });
  }
}
