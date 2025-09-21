import { Router } from "express";
import {
  createUser,
  getUsers,
  getUserById,
  updateUser,
  deleteUser,
} from "../controllers/users.controller";

const router = Router();

// Routes
router.post("/users", createUser);
router.get("/users", getUsers);
router.get("/users/:id", getUserById);
router.patch("/users/:id", updateUser);
router.delete("/users/:id", deleteUser);

export default router;
