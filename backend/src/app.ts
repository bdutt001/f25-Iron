import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import usersRouter from "./routes/users.routes";
import authRouter from "./routes/auth.routes";
import tagsRouter from "./routes/tags.routes";
import messagesRouter from "./routes/messages.routes";
import reportsRouter from "./routes/reports.routes";
import reportRouter from "./routes/report.routes";
import adminRouter from "./routes/admin.routes"
// ✅ Load environment variables before anything else
dotenv.config();

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.get("/", (_req: Request, res: Response) => res.status(200).send("Hello from Express"));
app.get("/api", (_req: Request, res: Response) => res.json({ status: "ok" }));

// Primary API surface (preferred)
app.use("/api/auth", authRouter);
app.use("/api", usersRouter);
app.use("/api", tagsRouter);
app.use("/api", reportsRouter);
app.use("/api", reportRouter);
app.use("/api/messages", messagesRouter);

// Legacy mounts kept active for current clients still hitting non-API-prefixed paths.
app.use("/auth", authRouter);
app.use("/", usersRouter);
app.use("/", tagsRouter);
app.use("/messages", messagesRouter);

export default app;

