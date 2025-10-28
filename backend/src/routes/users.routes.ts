import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import multer from "multer";
import path from "path";
import fs from "fs";
import { blockUser, unblockUser } from "../controllers/users.controller";
import { listMyBlockedUsers } from "../controllers/users.controller";
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
  updateVisibility,
  uploadProfilePicture, // ✅ controller now uploads to Cloudinary
} from "../controllers/users.controller";

const router = Router();

// ✅ Ensure the /temp folder exists at runtime
const tempDir = path.join(__dirname, "../../temp");
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
  console.log("📁 Created missing temp folder at:", tempDir);
}

// ✅ Configure Multer to use /temp for temporary files only
const storage = multer.diskStorage({
  destination: tempDir,
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}${path.extname(file.originalname)}`);
  },
});

const upload = multer({ storage });

// ✅ Require authentication for all user routes
router.use(authenticate);

// ✅ Core user routes
router.post("/users", createUser);
router.get("/users", getUsers);
router.get("/users/:id", getUserById);
router.patch("/users/:id", updateUser);
router.patch("/users/me/visibility", updateVisibility);
router.delete("/users/:id", deleteUser);
router.post("/users/:id/tags", addTag);
router.get("/users/tags/:tagName", getUsersByTag);
router.delete("/users/:id/tags/:tagName", deleteTagFromUser);

// ✅ Cloudinary upload route (uses temp storage)
router.post(
  "/users/:id/profile-picture",
  upload.single("image"), // multer stores image in /temp
  uploadProfilePicture     // controller uploads to Cloudinary and deletes temp file
);

// Blocking routes
router.post("/users/:id/block", blockUser);
router.delete("/users/:id/block", unblockUser);
router.get("/users/me/blocks", listMyBlockedUsers);

export default router;
