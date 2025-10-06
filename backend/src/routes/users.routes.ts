import { Router } from "express";
import multer from "multer";
import path from "path";
import prisma from "../prisma";
import {
  createUser,
  getUsers,
  getUserById,
  updateUser,
  deleteUser,
  listUsers,
  addTag,
  getUsersByTag,
  deleteTagFromUser,
  getUserByEmail,
  uploadProfilePictureByEmail,   //  new controller
} from "../controllers/users.controller";

const router = Router();

// --- Multer setup for profile picture uploads ---
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, "uploads/"); // saves into backend/uploads folder
  },
  filename: (_req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname)); // unique filename
  },
});
const upload = multer({ storage });

// --- Existing user routes ---
router.post("/users", createUser);
router.get("/users", listUsers);            // only one list route
router.get("/users/:id", getUserById);
router.patch("/users/:id", updateUser);
router.delete("/users/:id", deleteUser);

router.post("/users/:id/tags", addTag);
router.get("/users/tags/:tagName", getUsersByTag);
router.delete("/users/:id/tags/:tagName", deleteTagFromUser);

// --- Get user by email ---
router.get("/users/by-email/:email", getUserByEmail);

// Upload profile picture by email
router.post(
  "/users/by-email/:email/profile-picture",
  upload.single("image"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res
          .status(400)
          .json({ success: false, message: "No file uploaded" });
      }

      const email = req.params.email as string; // force it to string
      const filePath = `/uploads/${req.file.filename}`;

      const updatedUser = await prisma.user.update({
        where: { email }, // now safe
        data: { profilePicture: filePath },
      });

      res.json({
        success: true,
        profilePicture: filePath,
        user: updatedUser,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ success: false, message: "Upload failed" });
    }
  }
);



export default router;
