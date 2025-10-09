import { Router } from "express";
import {
  createUser,
  getUsers,
  getUserById,
  updateUser,
  deleteUser,
  listUsers, 
  addTag, 
  getUsersByTag,
  deleteTagFromUser
} from "../controllers/users.controller";

const router = Router();

// Routes
router.post("/users", createUser);
router.get("/users", getUsers);
router.get("/users/:id", getUserById);
router.patch("/users/:id", updateUser);
router.delete("/users/:id", deleteUser);
router.post("/users/:id/tags", addTag);                //Add tag to a user
router.get("/users/tags/:tagName", getUsersByTag);     //Get users by tag
router.delete("/users/:id/tags/:tagName", deleteTagFromUser); //Remove a tag from a user

export default router;
