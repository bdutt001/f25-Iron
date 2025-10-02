import prisma from '../prisma';
import { Prisma } from '@prisma/client';

// Get all users with their tags
export const getAllUsers = async () => {
  try {
    const users = await prisma.user.findMany({
      include: { tags: true },
    });
    return users;
  } catch (error) {
    console.error('Prisma error in getAllUsers:', error);
    throw new Error('Failed to fetch users');
  }
};

// Add a tag to a user (creates tag if it doesn't exist)
export const addTagToUser = async (userId: number, tagName: string) => {
  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        tags: {
          connectOrCreate: {
            where: { name: tagName },
            create: { name: tagName },
          },
        },
      },
      include: { tags: true },
    });
    return user;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      console.error('Prisma known request error in addTagToUser:', error);
    } else {
      console.error('Unknown error in addTagToUser:', error);
    }
    throw new Error('Failed to add tag to user');
  }
};

// Find users who have a certain tag
export const findUsersByTag = async (tagName: string) => {
  try {
    const users = await prisma.user.findMany({
      where: {
        tags: { some: { name: tagName } },
      },
      include: { tags: true },
    });
    return users;
  } catch (error) {
    console.error('Prisma error in findUsersByTag:', error);
    throw new Error('Failed to find users by tag');
  }
};
