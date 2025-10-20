import express from "express";
import usersRouter from "./routes/users.routes";
import authRouter from "./routes/auth.routes";
import tagsRouter from "./routes/tags.routes";
import cors from "cors";
import dotenv from "dotenv";

// Load .env variables
dotenv.config();

const app = express();

// ✅ Enable CORS for frontend access
app.use(cors());

// ✅ Parse incoming JSON requests
app.use(express.json());

// ✅ Health check routes
app.get("/api", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/", (_req, res) => {
  res.status(200).send("Hello from Express 🚀");
});

// ✅ Mount routes
app.use("/auth", authRouter);
app.use("/api/auth", authRouter); // back-compat

app.use("/api", usersRouter);
app.use("/", usersRouter); // allow /users and /api/users

app.use("/api", tagsRouter);
app.use("/", tagsRouter);

export default app;
