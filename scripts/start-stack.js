#!/usr/bin/env node
const { spawnSync, spawn } = require("child_process");
const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const backendDir = path.join(rootDir, "backend");
const frontendDir = path.join(rootDir, "frontend");
const pidFile = path.join(rootDir, ".stack-pids.json");

let shuttingDown = false;
const children = [];

function log(message) {
  console.log(`[stack] ${message}`);
}

function warn(message) {
  console.warn(`[stack] ${message}`);
}

function fail(message) {
  console.error(`[stack] ${message}`);
  process.exit(1);
}

function runNpm(args, options = {}) {
  log(`npm ${args.join(" ")}`);
  const result = spawnSync("npm", args, {
    stdio: "inherit",
    ...options,
  });

  if (result.status !== 0) {
    throw new Error(`Command failed: npm ${args.join(" ")}`);
  }
}

function readDatabaseUrl() {
  const envUrl = process.env.DATABASE_URL;
  if (envUrl) return envUrl;

  const envPath = path.join(backendDir, ".env");
  if (!fs.existsSync(envPath)) {
    return null;
  }

  const line = fs
    .readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((row) => row.startsWith("DATABASE_URL="));

  if (!line) return null;
  return line.slice("DATABASE_URL=".length).trim().replace(/^['"]|['"]$/g, "");
}

function parseDatabaseTarget(url) {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const port = Number(parsed.port) || 5432;
    return {
      url,
      host,
      port,
      label: `${host}:${port}`,
    };
  } catch (error) {
    warn(`Unable to parse DATABASE_URL (${error instanceof Error ? error.message : error}).`);
    return null;
  }
}

function verifyDatabaseReachable(target) {
  if (!target) return;

  log(`Checking database reachability at ${target.label} ...`);
  const socket = net.createConnection({ host: target.host, port: target.port });

  return new Promise((resolve, reject) => {
    socket.setTimeout(5000);
    socket.once("connect", () => {
      socket.end();
      log(`Database reachable at ${target.label}.`);
      resolve();
    });
    socket.once("error", (err) => {
      socket.destroy();
      reject(err);
    });
    socket.once("timeout", () => {
      socket.destroy();
      reject(new Error(`Timed out connecting to ${target.label}`));
    });
  });
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
    warn(`Failed to write pid file: ${err instanceof Error ? err.message : err}`);
  }
}

function terminateChild(child) {
  if (!child || !child.proc || child.proc.killed) return;

  child.proc.once("exit", () => {});

  try {
    child.proc.kill("SIGTERM");
  } catch (err) {
    warn(`Failed to send SIGTERM to ${child.name}: ${err instanceof Error ? err.message : err}`);
  }
}

function handleShutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  log("Shutting down...");

  for (const child of children) {
    terminateChild(child);
  }

  try {
    if (fs.existsSync(pidFile)) {
      fs.unlinkSync(pidFile);
    }
  } catch (err) {
    warn(`Failed to remove pid file: ${err instanceof Error ? err.message : err}`);
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
    log("Installing backend dependencies (npm install)...");
    runNpm(["install"], { cwd: backendDir });

    log("Installing frontend dependencies (npm install)...");
    runNpm(["install"], { cwd: frontendDir });

    if (!fs.existsSync(path.join(backendDir, ".env")) && !process.env.DATABASE_URL) {
      fail(
        "backend/.env is missing and DATABASE_URL is not set. Create backend/.env with the remote connection string before running the stack."
      );
    }

    const dbUrl = readDatabaseUrl();
    const dbTarget = parseDatabaseTarget(dbUrl);

    if (dbTarget) {
      try {
        await verifyDatabaseReachable(dbTarget);
      } catch (err) {
        throw new Error(
          `Failed to reach ${dbTarget.label}. Verify VPN/firewall settings before running the stack. ` +
          `Raw error: ${err instanceof Error ? err.message : String(err)}`
        );
      }

      log(
        "Skipping migrations and seed. Run them manually if needed: `npm --prefix backend exec prisma migrate deploy` and `npm --prefix backend run seed`."
      );
    } else {
      warn(
        "DATABASE_URL could not be resolved. The backend will start but expect connection errors until it is set."
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    fail(message);
  }

  const backendProc = spawn(
    "npm",
    ["run", "dev"],
    {
      cwd: backendDir,
      stdio: "inherit",
      shell: true,
    }
  );

  backendProc.on("exit", (code) => {
    if (!shuttingDown) {
      warn(`Backend process exited with code ${code}`);
      handleShutdown(code || 1);
    }
  });

  children.push({ name: "backend", proc: backendProc });
  persistPids();

  const lanIp = detectLanIp();
  log(`Using EXPO_PUBLIC_API_URL=http://${lanIp}:8000`);

  const expoProc = spawn(
    "npm",
    ["run", "start", "--", "--lan"],
    {
      cwd: frontendDir,
      stdio: "inherit",
      shell: true,
      env: {
        ...process.env,
        EXPO_PUBLIC_API_URL: `http://${lanIp}:8000`,
      },
    }
  );

  expoProc.on("exit", (code) => {
    if (!shuttingDown) {
      warn(`Expo process exited with code ${code}`);
      handleShutdown(code || 1);
    }
  });

  children.push({ name: "expo", proc: expoProc });
  persistPids();

  log("Stack running. Press Ctrl+C to stop.");
})();
