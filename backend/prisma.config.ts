import path from "path";
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  // Path to your main Prisma schema file
  schema: path.join("prisma", "schema.prisma"),

  // Migrations and seed configuration
  migrations: {
    path: path.join("prisma", "migrations"),
    seed: "ts-node --transpile-only src/scripts/seedFakeUsers.ts",
  },
});
