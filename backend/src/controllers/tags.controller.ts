import { Request, Response } from "express";
import prisma from "../prisma";
import { DEFAULT_INTEREST_TAGS } from "../config/tagCatalog";

// Create a tag
export const createTag = async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Tag name is required" });

    const tag = await prisma.tag.create({ data: { name } });
    res.status(201).json(tag);
  } catch (error: any) {
    if (error.code === "P2002") {
      return res.status(400).json({ error: "Tag already exists" });
    }
    res.status(500).json({ error: "Failed to create tag" });
  }
};

// Get the curated catalog of tags
export const getTagCatalog = (_req: Request, res: Response) => {
  res.json({ tags: DEFAULT_INTEREST_TAGS });
};

// Get all tags
export const getTags = async (_req: Request, res: Response) => {
  try {
    const tags = await prisma.tag.findMany();
    res.json(tags);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch tags" });
  }
};

// Get one tag by ID
export const getTagById = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: "Invalid tag ID" });
    }

    const tag = await prisma.tag.findUnique({ where: { id } });
    if (!tag) return res.status(404).json({ error: "Tag not found" });

    res.json(tag);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch tag" });
  }
};

// Update a tag
export const updateTag = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { name } = req.body;

    if (Number.isNaN(id)) {
      return res.status(400).json({ error: "Invalid tag ID" });
    }
    if (!name) {
      return res.status(400).json({ error: "Tag name is required" });
    }

    const tag = await prisma.tag.update({
      where: { id },
      data: { name },
    });

    res.json(tag);
  } catch (error: any) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Tag not found" });
    }
    res.status(500).json({ error: "Failed to update tag" });
  }
};

// Delete a tag
export const deleteTag = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: "Invalid tag ID" });
    }

    await prisma.tag.delete({ where: { id } });
    res.status(204).send(); // no content
  } catch (error: any) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Tag not found" });
    }
    res.status(500).json({ error: "Failed to delete tag" });
  }
};
