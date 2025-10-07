#!/usr/bin/env node
const path = require("path");
const dotenv = require("dotenv");
const { PrismaClient } = require("@prisma/client");

const envPath = path.join(__dirname, "../.env");
dotenv.config({ path: envPath });

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("[db-check] DATABASE_URL is not set. Create backend/.env or export it before running this command.");
  process.exit(1);
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
    const userCount = await prisma.user.count();
    console.log("[db-check] Connected to database successfully.");
    console.log(`[db-check] DATABASE_URL host: ${new URL(dbUrl).host}`);
    console.log(`[db-check] User records found: ${userCount}`);
  } catch (error) {
    console.error("[db-check] Failed to connect to the database.");
    console.error(error instanceof Error ? error.message : error);
    console.error("[db-check] Next steps:");
    console.error("  1. Confirm backend/.env has the correct Railway DATABASE_URL.");
    console.error("  2. Make sure the Railway Postgres instance is running and reachable from this network.");
    console.error(
      "  3. Retry with `npm test db` after verifying connectivity (ping the host or connect with psql if needed)."
    );
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
