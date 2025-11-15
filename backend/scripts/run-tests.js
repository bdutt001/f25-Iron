#!/usr/bin/env node
const { spawnSync } = require("child_process");

const args = process.argv.slice(2);
const [command, ...restArgs] = args;

if (command === "db") {
  const result = spawnSync("node", ["scripts/test-db.js"], { stdio: "inherit" });
  process.exit(result.status ?? 0);
}

const suite = command === "integration" ? "integration" : "unit";
const passthroughArgs = suite === "unit" ? args : restArgs;

const env = { ...process.env, TEST_SUITE: suite };
const jestArgs = ["--runInBand", "--config", "jest.config.js", ...passthroughArgs];

const jestResult = spawnSync("npx", ["jest", ...jestArgs], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env,
});

process.exit(jestResult.status ?? 0);
