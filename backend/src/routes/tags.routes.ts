import express from "express";
import {
    createTag, 
    getTags, 
    getTagById, 
    updateTag, 
    deleteTag } from "../controllers/tags.controller";

const router = express.Router();

router.post("/tags", createTag);      // Create a tag
router.get("/tags", getTags);         // Read all tags
router.get("/tags/:id", getTagById);   // Read one tag
router.put("/tags/:id", updateTag);    // Update a tag
router.delete("/tags/:id", deleteTag); // Delete a tag

export default router;