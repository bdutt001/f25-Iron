import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import usersRouter from "./routes/users.routes";
import authRouter from "./routes/auth.routes";
import tagsRouter from "./routes/tags.routes";
import messagesRouter from "./routes/messages.routes";
import reportsRouter from "./routes/reports.routes";
import reportRouter from "./routes/report.routes";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (_req, res) => res.status(200).send("Hello from Express"));
app.get("/api", (_req, res) => res.json({ status: "ok" }));

app.use("/auth", authRouter);
app.use("/api/auth", authRouter); // backwards compatibility

app.use("/api", usersRouter);
app.use("/", usersRouter); // allow legacy clients without /api prefix

app.use("/api", tagsRouter);
app.use("/", tagsRouter);

app.use("/api", reportsRouter);
app.use("/api", reportRouter);

app.use("/api/messages", messagesRouter);
app.use("/messages", messagesRouter);

export default app;

