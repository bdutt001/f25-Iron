import type { Prisma } from "@prisma/client";
import bcrypt from "bcrypt";
import { Request, Response } from "express";
import prisma from "../prisma";
import {
  addTagToUser,
  buildConnectOrCreate,
  findUsersByTag,
  getAllUsers,
  normalizeTagNames,
  serializeUser,
  userWithTagsSelect,
} from "../services/users.services";

const toNumberId = (value: string | undefined) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

// Create a new user
export const createUser = async (req: Request, res: Response) => {
  const emailRaw = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const usernameRaw = typeof req.body.username === "string" ? req.body.username.trim() : "";
  const nameRaw = typeof req.body.name === "string" ? req.body.name.trim() : undefined;
  const passwordRaw = typeof req.body.password === "string" ? req.body.password : "";
  const interestTagsInput = Array.isArray(req.body.interestTags) ? normalizeTagNames(req.body.interestTags) : [];

  if (!emailRaw) return res.status(400).json({ error: "Email is required" });
  if (!passwordRaw) return res.status(400).json({ error: "Password is required" });
  if (!usernameRaw) return res.status(400).json({ error: "Username is required" });

  try {
    const hashedPassword = await bcrypt.hash(passwordRaw, 10);

    const data: Prisma.UserCreateInput = {
      username: usernameRaw,
      email: emailRaw,
      password: hashedPassword,
    };

    if (nameRaw) data.name = nameRaw;
    if (interestTagsInput.length) {
      data.interestTags = {
        connectOrCreate: buildConnectOrCreate(interestTagsInput),
      };
    }

    const user = await prisma.user.create({
      data,
      select: userWithTagsSelect,
    });

    res.status(201).json(serializeUser(user));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create user" });
  }
};

// Get all users
export const getUsers = async (_req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({ select: userWithTagsSelect });
    res.json(users.map(serializeUser));
  } catch (err) {
    console.error("Failed to fetch users", err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
};

// Get one user by ID
export const getUserById = async (req: Request, res: Response) => {
  const userId = toNumberId(req.params.id);
  if (!userId) {
    return res.status(400).json({ error: "User not found" });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: userWithTagsSelect,
    });
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(serializeUser(user));
  } catch (err) {
    console.error("Failed to fetch user", err);
    res.status(500).json({ error: "Failed to fetch user" });
  }
};

// Update a user
export const updateUser = async (req: Request, res: Response) => {
  const userId = toNumberId(req.params.id);
  if (!userId) return res.status(400).json({ error: "User ID is required" });

  const emailRaw = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : undefined;
  const usernameRaw = typeof req.body.username === "string" ? req.body.username.trim() : undefined;
  const nameRaw = typeof req.body.name === "string" ? req.body.name.trim() : undefined;
  const passwordRaw = typeof req.body.password === "string" ? req.body.password.trim() : undefined;
  const interestTagsProvided = Array.isArray(req.body.interestTags)
    ? normalizeTagNames(req.body.interestTags)
    : null;

  try {
    const data: Prisma.UserUpdateInput = {};
    let passwordUpdated = false;

    if (emailRaw) data.email = emailRaw;
    if (usernameRaw) data.username = usernameRaw;
    if (typeof nameRaw === "string") data.name = nameRaw;

    if (passwordRaw) {
      data.password = await bcrypt.hash(passwordRaw, 10);
      passwordUpdated = true;
    }
    if (passwordUpdated) {
      data.tokenVersion = { increment: 1 };
    }

    if (interestTagsProvided !== null) {
      const interestUpdate: Prisma.TagUpdateManyWithoutUsersNestedInput = { set: [] };
      if (interestTagsProvided.length) {
        interestUpdate.connectOrCreate = buildConnectOrCreate(interestTagsProvided);
      }
      data.interestTags = interestUpdate;
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data,
      select: userWithTagsSelect,
    });
    res.json(serializeUser(user));
  } catch (err: any) {
    if (err?.code === "P2025") {
      return res.status(404).json({ error: "User not found" });
    }
    console.error("Failed to update user", err);
    res.status(500).json({ error: "Failed to update user" });
  }
};

// Delete a user
export const deleteUser = async (req: Request, res: Response) => {
  const userId = toNumberId(req.params.id);
  if (!userId) {
    return res.status(400).json({ error: "User not found" });
  }

  try {
    await prisma.user.delete({ where: { id: userId } });
    res.status(204).send();
  } catch (err: any) {
    if (err?.code === "P2025") {
      return res.status(404).json({ error: "User not found" });
    }
    console.error("Failed to delete user", err);
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
    const userId = toNumberId(req.params.id);
    if (!userId) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    const tagName = typeof req.body.tagName === "string" ? req.body.tagName : "";
    const normalized = normalizeTagNames([tagName])[0];
    if (!normalized) {
      return res.status(400).json({ error: "tagName is required" });
    }

    const user = await addTagToUser(userId, normalized);
    res.json(user);
  } catch (error) {
    console.error("Error adding tag to user:", error);
    res.status(500).json({ error: "Failed to add tag to user" });
  }
};

// Look for Users with a tag: GET /api/users/tags/:tagName
export const getUsersByTag = async (req: Request, res: Response) => {
  try {
    const normalized = normalizeTagNames([req.params.tagName ?? ""])[0];

    if (!normalized) {
      return res.status(400).json({ error: "tagName parameter is required" });
    }

    const users = await findUsersByTag(normalized);
    res.json(users);
  } catch (error) {
    console.error("Error finding users by tag:", error);
    res.status(500).json({ error: "Failed to find users by tag" });
  }
};

// Remove a tag from a user: DELETE /api/users/:id/tags/:tagName
export const deleteTagFromUser = async (req: Request, res: Response) => {
  try {
    const userId = toNumberId(req.params.id);
    const normalized = normalizeTagNames([req.params.tagName ?? ""])[0];

    if (!userId) {
      return res.status(400).json({ error: "Invalid user ID" });
    }
    if (!normalized) {
      return res.status(400).json({ error: "tagName is required" });
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        interestTags: {
          disconnect: { name: normalized },
        },
      },
      select: userWithTagsSelect,
    });

    res.json(serializeUser(user));
  } catch (error: any) {
    console.error("Error removing tag from user:", error);
    if (error?.code === "P2025") {
      return res.status(404).json({ error: "User or tag not found" });
    }
    res.status(500).json({ error: "Failed to remove tag from user" });
  }
};
