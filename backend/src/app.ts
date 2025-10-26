import express from "express";
import usersRouter from "./routes/users.routes";
import authRouter from "./routes/auth.routes";
import tagsRouter from "./routes/tags.routes";
import messagesRouter from "./routes/messages.routes";
import reportsRouter from "./routes/reports.routes";
import reportRouter from "./routes/report.routes";

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

// Mount user routes
app.use("/api", usersRouter);
app.use("/", usersRouter); // allow clients without /api prefix

// Mount auth routes are above at /auth and /api/auth for compatibility

// Mount tag routes
app.use("/api", tagsRouter);
app.use("/", tagsRouter); // allow clients without /api prefix

// Mount reports routes
app.use("/api", reportsRouter);
app.use("/api", reportRouter);

// Mount messaging routes
app.use("/api/messages", messagesRouter); 
app.use("/messages", messagesRouter);

export default app;
