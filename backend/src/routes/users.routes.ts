import { Router } from "express";
import {
  createUser,
  getUsers,
  getUserById,
  updateUser,
  deleteUser,
  listUsers, 
  addTag, 
  getUsersByTag
} from "../controllers/users.controller";

const router = Router();

// Routes
router.post("/users", createUser);
router.get("/users", getUsers);
router.get("/users/:id", getUserById);
router.patch("/users/:id", updateUser);
router.delete("/users/:id", deleteUser);
router.get("/users", listUsers);
router.post("/users/:id/tags", addTag);
router.get("/users/tags/:tagName", getUsersByTag);

export default router;
