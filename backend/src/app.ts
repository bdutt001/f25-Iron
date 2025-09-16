import express from "express";
import usersRouter from "./routes/users.routes";

const app = express();

// Middleware
app.use(express.json());

// Health check
app.get("/", (_req, res) => {
  res.status(200).send("Hello from Express 🚀");
});

// Mount user routes
app.use(usersRouter);

export default app;
