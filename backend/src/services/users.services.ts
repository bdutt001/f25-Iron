import prisma from "../prisma";
import { Prisma } from "@prisma/client";

export const userWithTagsSelect = {
  id: true,
  email: true,
  name: true,
  createdAt: true,
  interestTags: { select: { name: true } },
  trustScore: true,
} satisfies Prisma.UserSelect;

export type PrismaUserWithTags = Prisma.UserGetPayload<{ select: typeof userWithTagsSelect }>;
export type SerializedUser = Omit<PrismaUserWithTags, "interestTags"> & { interestTags: string[] };

export const serializeUser = (user: PrismaUserWithTags): SerializedUser => ({
  ...user,
  interestTags: user.interestTags.map((tag) => tag.name),
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
    select: userWithTagsSelect,
  });

  return users.map(serializeUser);
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
    },
    select: userWithTagsSelect,
  });

  return users.map(serializeUser);
};