import prisma from "../prisma";
import { Prisma } from "@prisma/client";

export const userWithTagsSelect = {
  id: true,
  email: true,
  name: true,
  createdAt: true,
  profilePicture: true,  // ✅ add this line
  interestTags: { select: { name: true } },
  trustScore: true,
  visibility: true,
} satisfies Prisma.UserSelect;

export type PrismaUserWithTags = Prisma.UserGetPayload<{ select: typeof userWithTagsSelect }>;
export type SerializedUser = Omit<PrismaUserWithTags, "interestTags"> & {
  interestTags: string[];
  visibility: boolean;
};

export const serializeUser = (user: PrismaUserWithTags): SerializedUser => ({
  ...user,
  interestTags: user.interestTags.map((tag) => tag.name),
  profilePicture: user.profilePicture ?? null,  // ✅ ensure it passes through
  visibility: user.visibility ?? false,
});

export const normalizeTagNames = (tags: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const tag of tags) {
    if (typeof tag !== "string") continue;
    const trimmed = tag.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }

  return result;
};

export const buildConnectOrCreate = (tags: string[]) =>
  tags.map((name) => ({
    where: { name },
    create: { name },
  }));

export const getAllUsers = async (): Promise<SerializedUser[]> => {
  const users = await prisma.user.findMany({
    where: { visibility: true },
    select: userWithTagsSelect,
  });

  return users.map(serializeUser);
};

export const updateUserVisibility = async (
  userId: number,
  visibility: boolean
): Promise<SerializedUser> => {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { visibility },
    select: userWithTagsSelect,
  });

  return serializeUser(user);
};

export const addTagToUser = async (userId: number, tagName: string): Promise<SerializedUser> => {
  const normalized = normalizeTagNames([tagName])[0];
  if (!normalized) {
    throw new Error("Tag name is required");
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      interestTags: {
        connectOrCreate: buildConnectOrCreate([normalized]),
      },
    },
    select: userWithTagsSelect,
  });

  return serializeUser(user);
};

export const findUsersByTag = async (tagName: string): Promise<SerializedUser[]> => {
  const normalized = normalizeTagNames([tagName])[0];
  if (!normalized) {
    return [];
  }

  const users = await prisma.user.findMany({
    where: {
      interestTags: {
        some: { name: normalized },
      },
      visibility: true,
    },
    select: userWithTagsSelect,
  });

  return users.map(serializeUser);
};
