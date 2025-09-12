import express from "express";
import cors from "cors";
import dotenv from "dotenv";

const app = express();
const PORT = 8000;

app.get("/", (_req, res) => {
  res.send("Hello from Express 🚀");
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});