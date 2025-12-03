// @ts-nocheck
import path from "path";
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  // Path to your main Prisma schema file
  schema: path.join("prisma", "schema.prisma"),

  // Datasource connection string for Prisma Migrate
  datasources: {
    db: {
      url: process.env.DATABASE_URL ?? "",
    },
  },

  // Migrations and seed configuration
  migrations: {
    path: path.join("prisma", "migrations"),
  },
});
