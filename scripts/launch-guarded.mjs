#!/usr/bin/env node
import { spawn } from "node:child_process";

const NPM_BIN = process.platform === "win32" ? "npm.cmd" : "npm";
const HEALTH_URL = "http://127.0.0.1:4000/health";
const LOGIN_URL = "http://127.0.0.1:4000/api/login";
const LOGIN_PROBE_PAYLOAD = {
  email: process.env.LOGIN_PROBE_EMAIL ?? "user1@example.com",
  password: process.env.LOGIN_PROBE_PASSWORD ?? "pass123",
};
const HEALTH_TIMEOUT_MS = Number(process.env.BE_HEALTH_TIMEOUT_MS ?? 30000);

let backendProc = null;
let frontendProc = null;
let shuttingDown = false;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const label = (value) => `[LAUNCH][${value}]`;

const log = (value) => {
  console.log(`${label("INFO")} ${value}`);
};

const logFail = (code, value) => {
  console.error(`${label(code)} ${value}`);
};

const runStep = (name, args, failureCode, failureMessage) =>
  new Promise((resolve, reject) => {
    log(`Running ${name}...`);
    const child = spawn(NPM_BIN, args, {
      stdio: "inherit",
      env: process.env,
      shell: false,
    });

    child.on("error", (error) => {
      logFail(failureCode, `${failureMessage}: ${error.message}`);
      reject(error);
    });

    child.on("exit", (code, signal) => {
      if (code === 0) {
        log(`${name} completed.`);
        resolve();
        return;
      }

      const signalText = signal ? ` (signal ${signal})` : "";
      logFail(
        failureCode,
        `${failureMessage}. Command: npm ${args.join(" ")}. Exit code: ${code ?? "unknown"}${signalText}.`,
      );
      reject(new Error(`${failureCode}: ${name} failed`));
    });
  });

const pumpOutput = (child, processLabel) => {
  if (child.stdout) {
    child.stdout.on("data", (chunk) => {
      process.stdout.write(`[${processLabel}] ${String(chunk)}`);
    });
  }

  if (child.stderr) {
    child.stderr.on("data", (chunk) => {
      process.stderr.write(`[${processLabel}] ${String(chunk)}`);
    });
  }
};

const killProcessTree = async (child, processLabel) => {
  if (!child || child.killed) {
    return;
  }

  const pid = child.pid;
  if (!pid) {
    return;
  }

  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
        stdio: "ignore",
        shell: false,
      });

      killer.on("exit", () => resolve());
      killer.on("error", () => resolve());
    });
  } else {
    child.kill("SIGTERM");
  }

  log(`Stopped ${processLabel}.`);
};

const waitForBackendHealth = async (timeoutMs) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(HEALTH_URL);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep retrying until timeout.
    }

    await sleep(500);
  }

  throw new Error("Backend health check timed out");
};

const verifyLoginProbe = async () => {
  if (process.env.SKIP_LOGIN_PROBE === "1") {
    log("Skipping login probe because SKIP_LOGIN_PROBE=1.");
    return;
  }

  let response;
  try {
    response = await fetch(LOGIN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(LOGIN_PROBE_PAYLOAD),
    });
  } catch (error) {
    throw new Error(`Login probe request failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (response.ok) {
    log("Login probe passed.");
    return;
  }

  const body = await response.text().catch(() => "");
  throw new Error(`Login probe failed with status ${response.status}. ${body}`);
};

const startBackend = () => {
  log("Starting backend...");
  backendProc = spawn(NPM_BIN, ["run", "dev", "--prefix", "backend"], {
    stdio: ["inherit", "pipe", "pipe"],
    env: process.env,
    shell: false,
  });
  pumpOutput(backendProc, "backend");

  backendProc.on("exit", async (code, signal) => {
    if (shuttingDown) {
      return;
    }

    const signalText = signal ? ` (signal ${signal})` : "";
    logFail("BACKEND_RUNTIME_EXIT", `Backend exited unexpectedly. Exit code: ${code ?? "unknown"}${signalText}.`);
    shuttingDown = true;
    await killProcessTree(frontendProc, "frontend");
    process.exit(code ?? 1);
  });
};

const startFrontend = () => {
  log("Starting frontend...");
  frontendProc = spawn(NPM_BIN, ["run", "dev", "--prefix", "frontend"], {
    stdio: ["inherit", "pipe", "pipe"],
    env: process.env,
    shell: false,
  });
  pumpOutput(frontendProc, "frontend");

  frontendProc.on("exit", async (code, signal) => {
    if (shuttingDown) {
      return;
    }

    const signalText = signal ? ` (signal ${signal})` : "";
    logFail("FRONTEND_RUNTIME_EXIT", `Frontend exited unexpectedly. Exit code: ${code ?? "unknown"}${signalText}.`);
    shuttingDown = true;
    await killProcessTree(backendProc, "backend");
    process.exit(code ?? 1);
  });
};

const cleanupAndExit = async (exitCode) => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  await killProcessTree(frontendProc, "frontend");
  await killProcessTree(backendProc, "backend");
  process.exit(exitCode);
};

process.on("SIGINT", async () => {
  log("Received SIGINT. Shutting down services...");
  await cleanupAndExit(0);
});

process.on("SIGTERM", async () => {
  log("Received SIGTERM. Shutting down services...");
  await cleanupAndExit(0);
});

const main = async () => {
  try {
    await runStep("database migration", ["run", "db:migrate"], "MIGRATION_ERROR", "Database migration step failed");

    startBackend();

    try {
      await waitForBackendHealth(HEALTH_TIMEOUT_MS);
      log("Backend health check passed.");
    } catch {
      logFail("BE_FAILED_TO_LAUNCH", `Backend did not become healthy at ${HEALTH_URL} within ${HEALTH_TIMEOUT_MS}ms.`);
      await cleanupAndExit(1);
      return;
    }

    try {
      await verifyLoginProbe();
    } catch (error) {
      logFail(
        "DB_POPULATION_FAILED",
        `Login probe failed, likely missing/broken seeded auth data. ${error instanceof Error ? error.message : String(error)}. Run: npm run db:seed`,
      );
      await cleanupAndExit(1);
      return;
    }

    startFrontend();

    log("Launch complete. Diagnostic guard is active.");
  } catch {
    await cleanupAndExit(1);
  }
};

await main();
