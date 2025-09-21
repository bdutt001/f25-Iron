#!/usr/bin/env node
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const pidFile = path.join(rootDir, ".stack-pids.json");
const isWindows = process.platform === "win32";

function log(msg) {
  console.log(`[stop-stack] ${msg}`);
}

function warn(msg) {
  console.warn(`[stop-stack] ${msg}`);
}

function commandExists(command, args = ["--version"]) {
  const result = spawnSync(command, args, { stdio: "ignore" });
  return result.status === 0;
}

function run(command, args) {
  log(`${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) {
    warn(`Command failed (code ${result.status}): ${command} ${args.join(" ")}`);
  }
}

function killPid(pid, label) {
  if (!pid || Number.isNaN(pid)) return;

  log(`Stopping ${label} (pid ${pid})`);

  if (isWindows) {
    run("taskkill", ["/PID", String(pid), "/T", "/F"]);
  } else {
    try {
      process.kill(pid, "SIGTERM");
    } catch (err) {
      warn(`SIGTERM failed for pid ${pid}: ${err.message}`);
    }

    const wait = spawnSync("sh", ["-c", `kill -0 ${pid}`], { stdio: "ignore" });
    if (wait.status === 0) {
      run("kill", ["-9", String(pid)]);
    }
  }
}

function killKnownProcesses() {
  const patterns = [
    "ts-node-dev --respawn --transpile-only src/index.ts",
    "npx expo start",
  ];

  for (const pattern of patterns) {
    log(`Searching for processes matching: ${pattern}`);
    if (isWindows) {
      run("wmic", ["process", "where", `CommandLine like '%${pattern.replace(/'/g, "''")}%'`, "call", "terminate"]);
    } else {
      run("pkill", ["-f", pattern]);
    }
  }
}

function stopDocker() {
  const dockerCmd = "docker";
  if (!commandExists(dockerCmd, ["--version"])) {
    warn("Docker CLI not found; skipping docker compose down");
    return;
  }

  if (commandExists(dockerCmd, ["compose", "version"])) {
    run(dockerCmd, ["compose", "down", "db"]);
  } else if (commandExists("docker-compose", ["--version"])) {
    run("docker-compose", ["down", "db"]);
  } else {
    warn("Docker Compose is not available; skipping docker shutdown");
  }
}

function main() {
  let killedViaPidFile = false;

  if (fs.existsSync(pidFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(pidFile, "utf8"));
      Object.entries(data).forEach(([label, pid]) => killPid(pid, label));
      fs.unlinkSync(pidFile);
      killedViaPidFile = true;
    } catch (err) {
      warn(`Failed to read pid file: ${err.message}`);
    }
  }

  if (!killedViaPidFile) {
    warn("PID file missing or invalid; falling back to process name matching.");
    killKnownProcesses();
  }

  stopDocker();
  log("Done.");
}

main();
