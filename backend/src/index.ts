// import express
const express = require("express");



const { PrismaClient } = require("./generated/prisma_client");

const app = express();

const prisma = new PrismaClient();

app.use(express.json());



const PORT = 3000;

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});