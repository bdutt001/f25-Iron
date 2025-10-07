import express from "express";
import usersRouter from "./routes/users.routes";
import tagsRouter from "./routes/tags.routes";
import reportsRouter from "./routes/reports.routes";

//import cors to enable cross-site origin requests outside of basic get post
import cors from "cors";

import dotenv from "dotenv";

const app = express();

// Add Cors to express for use
app.use(cors());

// Middleware
app.use(express.json());

// Health checks: JSON for clients, text for quick CLI curl
app.get("/api", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/", (_req, res) => {
  res.status(200).send("Hello from Express 🚀");
});

// Mount user routes
app.use("/api", usersRouter);

// Mount tag routes
app.use("/api", tagsRouter);

// Mount reports routes
app.use("/api", reportsRouter);

export default app;
