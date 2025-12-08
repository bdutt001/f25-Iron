import type { Prisma } from "@prisma/client";
import bcrypt from "bcrypt";
import { Request, Response } from "express";
import prisma from "../prisma";
import fs from "fs";
import { v2 as cloudinary } from "cloudinary";
import dotenv from "dotenv";
import { randomOduLocation } from "../config/location";
import {
  addTagToUser,
  buildConnectOrCreate,
  findUsersByTag,
  getAllUsers,
  normalizeTagNames,
  serializeUser,
  userWithTagsSelect,
  updateUserVisibility,
  deleteUserAndRelations,
  SerializedUser,
} from "../services/users.services";
import { haversineMeters } from "../utils/geo";

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

const DEFAULT_RADIUS_METERS = 500;
const MIN_RADIUS_METERS = 50;
const MAX_RADIUS_METERS = 5000;

const parseRadiusMeters = (value: unknown): number | null => {
  if (value === undefined) return DEFAULT_RADIUS_METERS;

  const radius = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(radius)) return null;

  const clamped = Math.max(MIN_RADIUS_METERS, Math.min(MAX_RADIUS_METERS, radius));
  return clamped;
};

const normalizedTagSet = (tags: string[]) => {
  const normalized = normalizeTagNames(tags).map((tag) => tag.toLowerCase());
  return new Set(normalized);
};

const computeMatchPercent = (mine: string[], theirs: string[]) => {
  const a = normalizedTagSet(mine);
  const b = normalizedTagSet(theirs);
  if (a.size === 0 && b.size === 0) return 0;

  let intersection = 0;
  for (const tag of a) {
    if (b.has(tag)) intersection += 1;
  }

  const union = a.size + b.size - intersection;
  return union > 0 ? Math.round((intersection / union) * 100) : 0;
};

type NearbyUserPayload = SerializedUser & {
  latitude: number;
  longitude: number;
  distanceMeters: number;
  matchPercent: number;
  locationUpdatedAt: Date;
};

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

    const user = await prisma.$transaction(async (tx) => {
      const oduCoords = randomOduLocation();

      const createdUser = await tx.user.create({
        data,
        select: userWithTagsSelect,
      });

      await tx.userLocation.create({
        data: {
          userId: createdUser.id,
          latitude: oduCoords.latitude,
          longitude: oduCoords.longitude,
        },
      });

      return createdUser;
    });

    res.status(201).json(serializeUser(user));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create user" });
  }
};

// ---------- Get All Users ----------
export const getUsers = async (req: Request, res: Response) => {
  try {
    const currentUserId = req.user?.id;
    if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });

    const users = await prisma.user.findMany({
      where: {
        visibility: true,
        NOT: {
          OR: [
            // Exclude users that current user has blocked
            { blocksReceived: { some: { blockerId: currentUserId } } },
            // Exclude users that have blocked current user
            { blocksMade: { some: { blockedId: currentUserId } } },
          ],
        },
        // Exclude self defensively
        id: { not: currentUserId },
      },
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
  const profilePictureRaw = req.body.profilePicture;

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

    if (profilePictureRaw === null) {
      data.profilePicture = null;
    } else if (typeof profilePictureRaw === "string") {
      const trimmed = profilePictureRaw.trim();
      if (trimmed) data.profilePicture = trimmed;
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

  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  if (req.user.id !== userId)
    return res.status(403).json({ error: "You can only delete your own account" });

  try {
    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!existing) return res.status(404).json({ error: "User not found" });

    await deleteUserAndRelations(userId);
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
export const getNearbyUsers = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const radiusMeters = parseRadiusMeters(req.query?.radius);
  if (radiusMeters === null) {
    return res.status(400).json({
      error: `radius must be a number between ${MIN_RADIUS_METERS} and ${MAX_RADIUS_METERS} meters`,
    });
  }

  const sortRaw = typeof req.query?.sort === "string" ? req.query.sort.toLowerCase() : "";
  const sortMode: "match" | "distance" = sortRaw === "distance" ? "distance" : "match";

  try {
    const myLocation = await prisma.userLocation.findFirst({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      select: { latitude: true, longitude: true, updatedAt: true },
    });

    if (!myLocation) {
      return res.status(400).json({ error: "No location set for current user" });
    }

    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { interestTags: { select: { name: true } } },
    });
    const myTags = normalizeTagNames(me?.interestTags.map((tag) => tag.name) ?? []);

    const candidateSelect = {
      ...userWithTagsSelect,
      locations: {
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: { latitude: true, longitude: true, updatedAt: true },
      },
    } satisfies Prisma.UserSelect;

    const candidates = await prisma.user.findMany({
      where: {
        visibility: true,
        id: { not: userId },
        NOT: {
          OR: [
            { blocksReceived: { some: { blockerId: userId } } },
            { blocksMade: { some: { blockedId: userId } } },
          ],
        },
      },
      select: candidateSelect,
    });

    const nearby: NearbyUserPayload[] = candidates
      .map((candidate) => {
        const latest = candidate.locations[0];
        if (!latest) return null;

        const distanceMeters = haversineMeters(
          myLocation.latitude,
          myLocation.longitude,
          latest.latitude,
          latest.longitude
        );
        if (!Number.isFinite(distanceMeters) || distanceMeters > radiusMeters) return null;

        const base = serializeUser(candidate);
        const matchPercent = computeMatchPercent(myTags, base.interestTags);

        return {
          ...base,
          latitude: latest.latitude,
          longitude: latest.longitude,
          distanceMeters,
          matchPercent,
          locationUpdatedAt: latest.updatedAt,
        };
      })
      .filter((value): value is NearbyUserPayload => Boolean(value));

    nearby.sort((a, b) => {
      if (sortMode === "distance") {
        return (
          a.distanceMeters - b.distanceMeters ||
          b.matchPercent - a.matchPercent ||
          a.id - b.id
        );
      }

      return (
        b.matchPercent - a.matchPercent ||
        a.distanceMeters - b.distanceMeters ||
        a.id - b.id
      );
    });

    return res.json({
      users: nearby,
      radius: radiusMeters,
      sort: sortMode,
      center: { latitude: myLocation.latitude, longitude: myLocation.longitude },
    });
  } catch (error) {
    console.error("Failed to load nearby users", error);
    return res.status(500).json({ error: "Failed to load nearby users" });
  }
};

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

// ---------- Blocking ----------
export const blockUser = async (req: Request, res: Response) => {
  try {
    const blockerId = req.user?.id;
    if (!blockerId) return res.status(401).json({ error: "Unauthorized" });

    const blockedId = Number(req.params.id);
    if (!Number.isFinite(blockedId) || blockedId <= 0)
      return res.status(400).json({ error: "Invalid user ID" });
    if (blockedId === blockerId)
      return res.status(400).json({ error: "Cannot block yourself" });

    // Ensure target exists (optional but clearer responses)
    const target = await prisma.user.findUnique({ where: { id: blockedId }, select: { id: true } });
    if (!target) return res.status(404).json({ error: "User not found" });

    const block = await prisma.block.upsert({
      where: {
        blockerId_blockedId: { blockerId, blockedId },
      },
      update: {},
      create: { blockerId, blockedId },
    });

    return res.status(201).json({ success: true, block });
  } catch (error: any) {
    console.error("Failed to block user", error);
    return res.status(500).json({ error: "Failed to block user" });
  }
};

export const unblockUser = async (req: Request, res: Response) => {
  try {
    const blockerId = req.user?.id;
    if (!blockerId) return res.status(401).json({ error: "Unauthorized" });

    const blockedId = Number(req.params.id);
    if (!Number.isFinite(blockedId) || blockedId <= 0)
      return res.status(400).json({ error: "Invalid user ID" });
    if (blockedId === blockerId)
      return res.status(400).json({ error: "Cannot unblock yourself" });

    await prisma.block.delete({
      where: {
        blockerId_blockedId: { blockerId, blockedId },
      },
    });

    return res.status(204).send();
  } catch (error: any) {
    if (error?.code === "P2025") {
      // Not found: treat as idempotent
      return res.status(204).send();
    }
    console.error("Failed to unblock user", error);
    return res.status(500).json({ error: "Failed to unblock user" });
  }
};

export const listMyBlockedUsers = async (req: Request, res: Response) => {
  try {
    const blockerId = req.user?.id;
    if (!blockerId) return res.status(401).json({ error: "Unauthorized" });

    const blocks = await prisma.block.findMany({
      where: { blockerId },
      include: { blocked: { select: userWithTagsSelect } },
      orderBy: { createdAt: "desc" },
    });

    const users = blocks.map((b) => serializeUser(b.blocked));
    return res.json(users);
  } catch (error) {
    console.error("Failed to list blocked users", error);
    return res.status(500).json({ error: "Failed to list blocked users" });
  }
};
