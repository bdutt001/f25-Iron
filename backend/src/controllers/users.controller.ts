import type { Prisma } from "@prisma/client";
import bcrypt from "bcrypt";
import { Request, Response } from "express";
import prisma from "../prisma";
import fs from "fs";
import { v2 as cloudinary } from "cloudinary";
import dotenv from "dotenv";
import {
  addTagToUser,
  buildConnectOrCreate,
  findUsersByTag,
  getAllUsers,
  normalizeTagNames,
  serializeUser,
  userWithTagsSelect,
  updateUserVisibility,
} from "../services/users.services";

// Load environment variables early
dotenv.config();

// Cloudinary setup
if (
  !process.env.CLOUDINARY_CLOUD_NAME ||
  !process.env.CLOUDINARY_API_KEY ||
  !process.env.CLOUDINARY_API_SECRET
) {
  throw new Error("❌ Missing Cloudinary environment variables.");
}
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME as string,
  api_key: process.env.CLOUDINARY_API_KEY as string,
  api_secret: process.env.CLOUDINARY_API_SECRET as string,
});

// ---------- Utility ----------
const toNumberId = (value: string | undefined) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const toCoord = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return NaN;
};

const isValidLatitude = (value: number) => Number.isFinite(value) && value >= -90 && value <= 90;
const isValidLongitude = (value: number) => Number.isFinite(value) && value >= -180 && value <= 180;

// ---------- Create User ----------
export const createUser = async (req: Request, res: Response) => {
  const emailRaw =
    typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const nameRaw =
    typeof req.body.name === "string" ? req.body.name.trim() : undefined;
  const passwordRaw =
    typeof req.body.password === "string" ? req.body.password : "";
  const interestTagsInput = Array.isArray(req.body.interestTags)
    ? normalizeTagNames(req.body.interestTags)
    : [];

  if (!emailRaw) return res.status(400).json({ error: "Email is required" });
  if (!passwordRaw) return res.status(400).json({ error: "Password is required" });

  try {
    const hashedPassword = await bcrypt.hash(passwordRaw, 10);

    const data: Prisma.UserCreateInput = {
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

// ---------- Get All Users ----------
export const getUsers = async (_req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      where: { visibility: true },
      select: userWithTagsSelect,
    });
    res.json(users.map(serializeUser));
  } catch (err) {
    console.error("Failed to fetch users", err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
};

// ---------- Get User by ID ----------
export const getUserById = async (req: Request, res: Response) => {
  const userId = toNumberId(req.params.id);
  if (!userId) return res.status(400).json({ error: "User not found" });

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

// ---------- Update User ----------
export const updateUser = async (req: Request, res: Response) => {
  const userId = toNumberId(req.params.id);
  if (!userId) return res.status(400).json({ error: "User ID is required" });

  const emailRaw =
    typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : undefined;
  const nameRaw =
    typeof req.body.name === "string" ? req.body.name.trim() : undefined;
  const passwordRaw =
    typeof req.body.password === "string" ? req.body.password.trim() : undefined;
  const interestTagsProvided = Array.isArray(req.body.interestTags)
    ? normalizeTagNames(req.body.interestTags)
    : null;
  const visibilityRaw =
    typeof req.body.visibility === "boolean" ? req.body.visibility : undefined;

  try {
    const data: Prisma.UserUpdateInput = {};
    let passwordUpdated = false;

    if (emailRaw) data.email = emailRaw;
    if (typeof nameRaw === "string") data.name = nameRaw;

    if (passwordRaw) {
      data.password = await bcrypt.hash(passwordRaw, 10);
      passwordUpdated = true;
    }
    if (passwordUpdated) data.tokenVersion = { increment: 1 };

    if (interestTagsProvided !== null) {
      const interestUpdate: Prisma.TagUpdateManyWithoutUsersNestedInput = { set: [] };
      if (interestTagsProvided.length) {
        interestUpdate.connectOrCreate = buildConnectOrCreate(interestTagsProvided);
      }
      data.interestTags = interestUpdate;
    }

    if (typeof visibilityRaw === "boolean") {
      data.visibility = visibilityRaw;
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data,
      select: userWithTagsSelect,
    });
    res.json(serializeUser(user));
  } catch (err: any) {
    if (err?.code === "P2025")
      return res.status(404).json({ error: "User not found" });
    console.error("Failed to update user", err);
    res.status(500).json({ error: "Failed to update user" });
  }
};

// ---------- Delete User ----------
export const deleteUser = async (req: Request, res: Response) => {
  const userId = toNumberId(req.params.id);
  if (!userId) return res.status(400).json({ error: "User not found" });

  try {
    await prisma.user.delete({ where: { id: userId } });
    res.status(204).send();
  } catch (err: any) {
    if (err?.code === "P2025")
      return res.status(404).json({ error: "User not found" });
    console.error("Failed to delete user", err);
    res.status(500).json({ error: "Failed to delete user" });
  }
};

// ---------- List Users ----------
export const listUsers = async (_req: Request, res: Response) => {
  try {
    const users = await getAllUsers();
    res.json(users);
  } catch (error) {
    console.error("Error listing users:", error);
    res.status(500).json({ error: "Failed to list users" });
  }
};

// ---------- Update Visibility (self) ----------
export const updateVisibility = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const visibility = req.body?.visibility;
  if (typeof visibility !== "boolean") {
    return res.status(400).json({ error: "visibility must be a boolean" });
  }

  try {
    const updated = await updateUserVisibility(userId, visibility);
    return res.json(updated);
  } catch (error) {
    console.error("Failed to update visibility", error);
    return res.status(500).json({ error: "Failed to update visibility" });
  }
};

// ---------- Add Tag ----------
export const addTag = async (req: Request, res: Response) => {
  try {
    const userId = toNumberId(req.params.id);
    if (!userId)
      return res.status(400).json({ error: "Invalid user ID" });

    const tagName = typeof req.body.tagName === "string" ? req.body.tagName : "";
    const normalized = normalizeTagNames([tagName])[0];
    if (!normalized)
      return res.status(400).json({ error: "tagName is required" });

    const user = await addTagToUser(userId, normalized);
    res.json(user);
  } catch (error) {
    console.error("Error adding tag to user:", error);
    res.status(500).json({ error: "Failed to add tag to user" });
  }
};

// ---------- Find Users by Tag ----------
export const getUsersByTag = async (req: Request, res: Response) => {
  try {
    const normalized = normalizeTagNames([req.params.tagName ?? ""])[0];
    if (!normalized)
      return res.status(400).json({ error: "tagName parameter is required" });

    const users = await findUsersByTag(normalized);
    res.json(users);
  } catch (error) {
    console.error("Error finding users by tag:", error);
    res.status(500).json({ error: "Failed to find users by tag" });
  }
};

// ---------- User Location (self) ----------
export const setMyLocation = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const latitude = toCoord(req.body?.latitude);
  const longitude = toCoord(req.body?.longitude);

  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) {
    return res.status(400).json({
      error: "latitude must be between -90 and 90 and longitude between -180 and 180",
    });
  }

  try {
    const location = await prisma.userLocation.create({
      data: { userId, latitude, longitude },
      select: { userId: true, latitude: true, longitude: true, updatedAt: true },
    });

    return res.status(201).json(location);
  } catch (error) {
    console.error("Failed to save user location", error);
    return res.status(500).json({ error: "Failed to save location" });
  }
};

export const getMyLocation = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const location = await prisma.userLocation.findFirst({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      select: { userId: true, latitude: true, longitude: true, updatedAt: true },
    });

    if (!location) return res.status(404).json({ error: "Location not found" });
    return res.json(location);
  } catch (error) {
    console.error("Failed to fetch user location", error);
    return res.status(500).json({ error: "Failed to fetch location" });
  }
};

// ---------- Remove Tag ----------
export const deleteTagFromUser = async (req: Request, res: Response) => {
  try {
    const userId = toNumberId(req.params.id);
    const normalized = normalizeTagNames([req.params.tagName ?? ""])[0];

    if (!userId)
      return res.status(400).json({ error: "Invalid user ID" });
    if (!normalized)
      return res.status(400).json({ error: "tagName is required" });

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
    if (error?.code === "P2025")
      return res.status(404).json({ error: "User or tag not found" });
    res.status(500).json({ error: "Failed to remove tag from user" });
  }
};

// ---------- Upload Profile Picture ----------
export const uploadProfilePicture = async (req: Request, res: Response) => {
  try {
    const userId = Number(req.params.id);
    if (!userId)
      return res.status(400).json({ error: "Invalid user ID" });
    if (!req.file)
      return res.status(400).json({ error: "No file uploaded" });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user)
      return res.status(404).json({ error: "User not found" });

    // Upload to Cloudinary
    const uploadResult = await cloudinary.uploader.upload(req.file.path, {
      folder: "minglemap_profiles",
      transformation: [{ width: 512, height: 512, crop: "limit" }],
    });

    // Remove temp file
    fs.unlink(req.file.path, (err) => {
      if (err) console.warn("⚠️ Could not delete local temp file:", err.message);
    });

    // Save URL in DB
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { profilePicture: uploadResult.secure_url },
    });

    console.log("✅ Uploaded to Cloudinary for user:", userId);
    return res.json({
      success: true,
      profilePicture: uploadResult.secure_url,
      user: updatedUser,
    });
  } catch (error) {
    console.error("❌ Error uploading profile picture:", error);
    return res.status(500).json({ error: "Failed to upload profile picture" });
  }
};
