import express from "express";
import usersRouter from "./routes/users.routes";

//import cors to enable cross-site origin requests outside of basic get post
import cors from "cors";

import dotenv from "dotenv";

const app = express();

// Add Cors to express for use
// accepts request from anywhere , must change if deploying
app.use(cors({ origin: "*" }));

// Middleware
app.use(express.json());

// Health check
app.get("/api", (_req, res) => {
  res.json({ status: "ok"});
});

// Mount user routes
app.use(usersRouter);

export default app;
