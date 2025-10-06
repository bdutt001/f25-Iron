import app from "./app";
import express from "express";
import path from "path";

const PORT = process.env.PORT || 8000;

// Serve static files from "uploads" folder
app.use(
  "/uploads",
  express.static(path.join(__dirname, "../uploads"))
);

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📂 Serving uploads from http://localhost:${PORT}/uploads`);
});
