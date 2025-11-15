#!/usr/bin/env node
/**
 * Minimal start script:
 * 1. npm install backend + frontend
 * 2. start backend dev server
 * 3. start Expo (LAN mode) with EXPO_PUBLIC_API_URL
 *
 * No DB probing, no auto-migrations—just the basics so it works the same on macOS/Windows.
 */
const { spawnSync, spawn } = require("child_process");
const os = require("os");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const backendDir = path.join(rootDir, "backend");
const frontendDir = path.join(rootDir, "frontend");

const children = [];
let shuttingDown = false;

const log = (msg) => console.log(`[stack] ${msg}`);
const warn = (msg) => console.warn(`[stack] ${msg}`);

const runInstall = (dir) => {
  const label = path.relative(rootDir, dir) || ".";
  log(`Installing dependencies in ${label} ...`);
  const res = spawnSync("npm", ["install"], {
    cwd: dir,
    stdio: "inherit",
    shell: true,
  });
  if (res.status !== 0) {
    throw new Error(`npm install failed in ${label}`);
  }
};

const detectLanIp = () => {
  const nets = os.networkInterfaces();
  for (const entries of Object.values(nets)) {
    for (const net of entries || []) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return "localhost";
};

const terminateChild = (child) => {
  if (!child?.proc || child.proc.killed) return;
  try {
    child.proc.kill("SIGTERM");
  } catch (error) {
    warn(`Failed to stop ${child.name}: ${error instanceof Error ? error.message : error}`);
  }
};

const handleShutdown = (code = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;
  log("Shutting down...");
  for (const child of children) {
    terminateChild(child);
  }
  process.exit(code);
};

process.on("SIGINT", () => handleShutdown(0));
process.on("SIGTERM", () => handleShutdown(0));
process.on("uncaughtException", (err) => {
  console.error("[stack] Uncaught exception:", err);
  handleShutdown(1);
});

(function main() {
  try {
    runInstall(backendDir);
    runInstall(frontendDir);
  } catch (error) {
    console.error("[stack] Dependency install failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  }

  const backendProc = spawn("npm", ["run", "dev"], {
    cwd: backendDir,
    stdio: "inherit",
    shell: true,
  });
  backendProc.on("exit", (code) => {
    if (!shuttingDown) {
      warn(`Backend exited with code ${code}`);
      handleShutdown(code || 1);
    }
  });
  children.push({ name: "backend", proc: backendProc });

  const lanIp = detectLanIp();
  log(`Using EXPO_PUBLIC_API_URL=http://${lanIp}:8000`);

  const expoProc = spawn("npm", ["run", "start", "--", "--lan"], {
    cwd: frontendDir,
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      EXPO_PUBLIC_API_URL: `http://${lanIp}:8000`,
    },
  });
  expoProc.on("exit", (code) => {
    if (!shuttingDown) {
      warn(`Expo exited with code ${code}`);
      handleShutdown(code || 1);
    }
  });
  children.push({ name: "expo", proc: expoProc });

  log("Stack running. Press Ctrl+C when you want to stop both processes.");
})();
