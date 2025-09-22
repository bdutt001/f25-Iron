#!/usr/bin/env node
const { spawnSync, spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const readline = require("readline");
const net = require("net");

const rootDir = path.resolve(__dirname, "..");
const backendDir = path.join(rootDir, "backend");
const frontendDir = path.join(rootDir, "frontend");
const pidFile = path.join(rootDir, ".stack-pids.json");

const isWindows = process.platform === "win32";
const npmCmd = isWindows ? "npm.cmd" : "npm";
const npxCmd = isWindows ? "npx.cmd" : "npx";
const dockerCmd = isWindows ? "docker" : "docker";

let composeBin = dockerCmd;
let composeArgsBase = ["compose"]; // default to docker compose plugin
let composeDisplay = "docker compose";

let shuttingDown = false;
const children = [];

function runSync(command, args, options = {}) {
  console.log(`[stack] ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    ...options,
  });

  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(" ")}`);
  }
}

function runCompose(args, options = {}) {
  return runSync(composeBin, [...composeArgsBase, ...args], options);
}

function commandExists(command, args = ["--version"]) {
  const result = spawnSync(command, args, {
    stdio: "ignore",
  });
  return result.status === 0;
}

function askYesNo(question, defaultYes = true) {
  if (!process.stdin.isTTY) {
    return Promise.resolve(defaultYes);
  }

  const suffix = defaultYes ? " [Y/n] " : " [y/N] ";

  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(question + suffix, (answer) => {
      rl.close();
      const trimmed = (answer || "").trim().toLowerCase();
      if (!trimmed) {
        resolve(defaultYes);
        return;
      }
      if (["y", "yes"].includes(trimmed)) {
        resolve(true);
      } else if (["n", "no"].includes(trimmed)) {
        resolve(false);
      } else {
        resolve(defaultYes);
      }
    });
  });
}

async function ensureNodeModules(dir, label) {
  if (fs.existsSync(path.join(dir, "node_modules"))) {
    return;
  }

  const runInstall = await askYesNo(
    `[stack] ${label} dependencies are missing. Run npm install now?`,
    true
  );

  if (!runInstall) {
    throw new Error(`${label} dependencies are required. Aborting.`);
  }

  runSync(npmCmd, ["install"], { cwd: dir });
}

async function ensureBackendEnv() {
  const envPath = path.join(backendDir, ".env");
  if (fs.existsSync(envPath)) {
    return;
  }

  const createEnv = await askYesNo(
    "[stack] backend/.env is missing. Create one with default DATABASE_URL?",
    true
  );

  if (!createEnv) {
    throw new Error("backend/.env is required. Aborting.");
  }

  const defaultEnv =
    "DATABASE_URL=postgresql://postgres:postgres@localhost:5432/minglemap?schema=public\n";
  fs.writeFileSync(envPath, defaultEnv, "utf8");
  console.log("[stack] Created backend/.env with default configuration.");
}

async function runPreflight() {
  console.log("[stack] Running preflight checks...");

  if (!commandExists(dockerCmd, ["--version"])) {
    throw new Error(
      "Docker CLI not found. Install Docker Desktop and ensure 'docker' is on your PATH."
    );
  }

  if (commandExists(dockerCmd, ["compose", "version"])) {
    composeBin = dockerCmd;
    composeArgsBase = ["compose"];
    composeDisplay = "docker compose";
  } else if (commandExists("docker-compose", ["--version"])) {
    composeBin = "docker-compose";
    composeArgsBase = [];
    composeDisplay = "docker-compose";
  } else {
    throw new Error(
      "Docker Compose not found. Install Docker Desktop 2.20+ or the standalone docker-compose.");
  }

  const psResult = spawnSync(dockerCmd, ["ps"], {
    stdio: "ignore",
  });
  if (psResult.status !== 0) {
    throw new Error(
      "Docker daemon is not running. Start Docker Desktop and try again."
    );
  }

  await ensureNodeModules(backendDir, "backend");
  await ensureNodeModules(frontendDir, "frontend");
  await ensureBackendEnv();

  console.log("[stack] Preflight checks passed. Using", composeDisplay);
}

function getDbConnectionTarget() {
  const fallback = { host: "localhost", port: 5432 };
  const envUrl =
    process.env.DATABASE_URL ||
    (() => {
      try {
        const envPath = path.join(backendDir, ".env");
        if (!fs.existsSync(envPath)) return null;
        const line = fs
          .readFileSync(envPath, "utf8")
          .split(/\r?\n/)
          .find((row) => row.startsWith("DATABASE_URL="));
        return line ? line.slice("DATABASE_URL=".length) : null;
      } catch {
        return null;
      }
    })();

  if (!envUrl) return fallback;

  try {
    const parsed = new URL(envUrl.trim());
    return {
      host: parsed.hostname || fallback.host,
      port: Number(parsed.port) || fallback.port,
    };
  } catch {
    return fallback;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForPostgres(target, retries = 30, delayMs = 1000) {
  const { host, port } = target;
  console.log(`[stack] Waiting for Postgres on ${host}:${port} ...`);

  for (let attempt = 1; attempt <= retries; attempt++) {
    const reachable = await new Promise((resolve) => {
      const socket = net.createConnection({ host, port }, () => {
        socket.end();
        resolve(true);
      });
      socket.on("error", () => {
        socket.destroy();
        resolve(false);
      });
      socket.setTimeout(delayMs / 2, () => {
        socket.destroy();
        resolve(false);
      });
    });

    if (reachable) {
      console.log("[stack] Postgres is ready.");
      return;
    }

    if (attempt < retries) {
      console.log(
        `[stack] Postgres not ready yet (${attempt}/${retries}). Retrying in ${delayMs}ms...`
      );
      await delay(delayMs);
    }
  }

  throw new Error("Timed out waiting for Postgres to accept connections.");
}

function detectLanIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return "localhost";
}

function terminateChild(child) {
  if (!child || child.killed) return;

  if (isWindows) {
    spawnSync("taskkill", ["/pid", child.pid, "/T", "/F"], {
      stdio: "inherit",
    });
  } else {
    child.kill("SIGTERM");
  }
}

function handleShutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("\n[stack] Shutting down...");

  for (const { proc } of children) {
    terminateChild(proc);
  }

  try {
    runCompose(["down", "db"], { cwd: rootDir });
  } catch (err) {
    console.warn("[stack] docker compose down failed:", err.message);
  }

  try {
    if (fs.existsSync(pidFile)) {
      fs.unlinkSync(pidFile);
    }
  } catch (err) {
    console.warn("[stack] Failed to remove pid file:", err.message);
  }

  process.exit(code);
}

process.on("SIGINT", () => handleShutdown(0));
process.on("SIGTERM", () => handleShutdown(0));
process.on("uncaughtException", (err) => {
  console.error("[stack] Uncaught exception:", err);
  handleShutdown(1);
});

(async function main() {
  try {
    await runPreflight();
    runCompose(["up", "-d", "db"], { cwd: rootDir });
    const dbTarget = getDbConnectionTarget();
    await waitForPostgres(dbTarget);
    runSync(npxCmd, ["prisma", "migrate", "deploy"], { cwd: backendDir });
    runSync(npmCmd, ["run", "seed"], { cwd: backendDir });
  } catch (err) {
    console.error("[stack] Failed to prepare environment:", err.message);
    process.exit(1);
  }

  const backendProc = spawn(npmCmd, ["run", "dev"], {
    cwd: backendDir,
    stdio: "inherit",
  });

  backendProc.on("exit", (code) => {
    if (!shuttingDown) {
      console.error(`[stack] Backend process exited with code ${code}`);
      handleShutdown(code || 1);
    }
  });

  children.push({ name: "backend", proc: backendProc });
  persistPids();

  const lanIp = detectLanIp();
  console.log(`[stack] Using EXPO_PUBLIC_API_URL=http://${lanIp}:8000`);

  const expoProc = spawn(
    npxCmd,
    ["expo", "start", "--lan"],
    {
      cwd: frontendDir,
      stdio: "inherit",
      env: {
        ...process.env,
        EXPO_PUBLIC_API_URL: `http://${lanIp}:8000`,
      },
    }
  );

  expoProc.on("exit", (code) => {
    if (!shuttingDown) {
      console.error(`[stack] Expo process exited with code ${code}`);
      handleShutdown(code || 1);
    }
  });

  children.push({ name: "expo", proc: expoProc });

  persistPids();

  console.log("\n[stack] Stack running. Press Ctrl+C to stop.");
})();

function persistPids() {
  const data = {};
  for (const child of children) {
    if (child.proc && child.proc.pid) {
      data[child.name] = child.proc.pid;
    }
  }

  try {
    fs.writeFileSync(pidFile, JSON.stringify(data, null, 2));
  } catch (err) {
    console.warn("[stack] Failed to write pid file:", err.message);
  }
}
