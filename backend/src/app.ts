import express from "express";
import usersRouter from "./routes/users.routes";
import tagsRouter from "./routes/tags.routes";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";

const app = express();

// Add Cors to express for use
app.use(cors());

// Middleware
app.use(express.json());

// Serve uploads folder statically
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

// Health check
app.get("/api", (_req, res) => {
  res.json({ status: "ok" });
});

// Mount user routes
app.use("/api", usersRouter);

// Mount tag routes
app.use("/api", tagsRouter);

export default app;
