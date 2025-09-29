#!/usr/bin/env node
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const pidFile = path.join(rootDir, ".stack-pids.json");
const isWindows = process.platform === "win32";

function log(message) {
  console.log(`[stop-stack] ${message}`);
}

function warn(message) {
  console.warn(`[stop-stack] ${message}`);
}

function runCommand(command, args) {
  spawnSync(command, args, { stdio: "inherit", shell: true });
}

function killPid(pid, label) {
  if (!pid || Number.isNaN(pid)) return;

  log(`Stopping ${label} (pid ${pid})`);

  if (isWindows) {
    runCommand("taskkill", ["/PID", String(pid), "/T", "/F"]);
  } else {
    try {
      process.kill(pid, "SIGTERM");
    } catch (err) {
      warn(`Failed to send SIGTERM to ${pid}: ${err instanceof Error ? err.message : err}`);
    }

    const check = spawnSync("kill", ["-0", String(pid)]);
    if (check.status === 0) {
      runCommand("kill", ["-9", String(pid)]);
    }
  }
}

function killByPattern(pattern) {
  log(`Searching for lingering processes: ${pattern}`);
  if (isWindows) {
    runCommand("wmic", ["process", "where", `CommandLine like '%${pattern}%'`, "call", "terminate"]);
  } else {
    spawnSync("pkill", ["-f", pattern], { stdio: "ignore" });
  }
}

function stopProcesses() {
  let killedFromFile = false;

  if (fs.existsSync(pidFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(pidFile, "utf8"));
      Object.entries(data).forEach(([label, pid]) => killPid(pid, label));
      fs.unlinkSync(pidFile);
      killedFromFile = true;
    } catch (err) {
      warn(`Failed to read pid file: ${err instanceof Error ? err.message : err}`);
    }
  }

  if (!killedFromFile) {
    warn("PID file missing or invalid; falling back to pattern match.");
    killByPattern("npm run dev");
    killByPattern("npm run start -- --lan");
  }
}

function main() {
  stopProcesses();
  log("Done.");
}

main();
