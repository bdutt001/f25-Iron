import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import multer from "multer";
import path from "path";
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
  uploadProfilePicture, // ✅ new controller
} from "../controllers/users.controller";

// ✅ Configure Multer storage
const storage = multer.diskStorage({
  destination: path.join(__dirname, "../../uploads"),
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}${path.extname(file.originalname)}`);
  },
});

const upload = multer({ storage });

const router = Router();

router.use(authenticate);

// Routes
router.post("/users", createUser);
router.get("/users", getUsers);
router.get("/users/:id", getUserById);
router.patch("/users/:id", updateUser);
router.delete("/users/:id", deleteUser);
router.post("/users/:id/tags", addTag);
router.get("/users/tags/:tagName", getUsersByTag);
router.delete("/users/:id/tags/:tagName", deleteTagFromUser);

// ✅ New upload route
router.post(
  "/users/:id/profile-picture",
  upload.single("image"),
  uploadProfilePicture
);

export default router;
