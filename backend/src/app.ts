import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import usersRouter from "./routes/users.routes";
import authRouter from "./routes/auth.routes";
import tagsRouter from "./routes/tags.routes";
import messagesRouter from "./routes/messages.routes";
import reportsRouter from "./routes/reports.routes";
import reportRouter from "./routes/report.routes";

// ✅ Load environment variables before anything else
dotenv.config();

const app = express();

// ✅ Enable CORS for all requests (frontend → backend)
app.use(cors());

// ✅ Parse JSON bodies
app.use(express.json());

// ✅ Health check endpoints
app.get("/", (_req, res) => res.status(200).send("Hello from Express 🚀"));
app.get("/api", (_req, res) => res.json({ status: "ok" }));

// ✅ Route mounts
app.use("/auth", authRouter);
app.use("/api/auth", authRouter); // backwards-compat

app.use("/api", usersRouter);
app.use("/", usersRouter); // allow legacy clients without /api prefix

app.use("/api", tagsRouter);
app.use("/", tagsRouter);

app.use("/api", reportsRouter);
app.use("/api", reportRouter);

// Mount messaging routes
app.use("/api/messages", messagesRouter); 
app.use("/messages", messagesRouter);

// ✅ No /uploads folder served — Cloudinary handles media now

export default app;
