import express from "express";
import usersRouter from "./routes/users.routes";
import authRouter from "./routes/auth.routes";
import tagsRouter from "./routes/tags.routes";
import path from "path";


//import cors to enable cross-site origin requests outside of basic get post
import cors from "cors";

import dotenv from "dotenv";

const app = express();

// Add Cors to express for use
app.use(cors());

// Middleware
app.use(express.json());
app.use('/auth', authRouter);
// Back-compat for older clients that expect /api/auth
app.use('/api/auth', authRouter);

// Health checks: JSON for clients, text for quick CLI curl
app.get("/api", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/", (_req, res) => {
  res.status(200).send("Hello from Express 🚀");
});

// Makes uploaded images accessible from URLs like: http://localhost:8000/uploads/17234512345.jpg
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Mount user routes
app.use("/api", usersRouter);
app.use("/", usersRouter); // allow clients without /api prefix

// Mount auth routes are above at /auth and /api/auth for compatibility

// Mount tag routes
app.use("/api", tagsRouter);
app.use("/", tagsRouter); // allow clients without /api prefix

export default app;
