#!/usr/bin/env node
const { spawnSync } = require("child_process");

const args = process.argv.slice(2);

if (args[0] === "db") {
  const result = spawnSync("node", ["scripts/test-db.js"], { stdio: "inherit" });
  process.exit(result.status ?? 0);
}

const jestResult = spawnSync("npx", ["jest", ...args], { stdio: "inherit", shell: process.platform === "win32" });
process.exit(jestResult.status ?? 0);
