import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";

const port = 3100;
const root = process.cwd();
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const playwrightBin = path.join(root, "node_modules", "@playwright", "test", "cli.js");
const tempDirectory = mkdtempSync(path.join(tmpdir(), "crosspoint-browser-e2e-"));
const databasePath = path.join(tempDirectory, "scenario.sqlite");
let server;

function runNode(args, env = process.env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: root, env, stdio: "inherit" });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

async function waitForServerExit(timeoutMs) {
  if (!server || server.exitCode !== null || server.signalCode !== null) return;
  await Promise.race([
    new Promise((resolve) => server.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

async function stopServer() {
  if (!server?.pid) return;
  server.kill("SIGTERM");
  await waitForServerExit(2_000);
  if (process.platform === "win32" && server.exitCode === null && server.signalCode === null) {
    spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    await waitForServerExit(2_000);
  }
}

async function waitForServer() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (server.exitCode !== null) throw new Error("CrossPoint E2E server exited before it became ready.");
    try {
      const response = await fetch(`http://localhost:${port}/`, { signal:AbortSignal.timeout(1_000) });
      if (response.ok) return;
    } catch { /* Retry while Next.js is starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Timed out waiting for the CrossPoint E2E server.");
}

try {
  const buildCode = await runNode([nextBin, "build"]);
  if (buildCode !== 0) process.exitCode = buildCode;
  else {
    const serverEnv = {
      ...process.env,
      DEMO_MODE: "true",
      DEMO_SESSION_SECRET: randomBytes(32).toString("base64url"),
      CROSSPOINT_DB_PATH: databasePath,
    };
    server = spawn(process.execPath, [nextBin, "start", "-p", String(port)], { cwd:root, env:serverEnv, stdio:"inherit" });
    await waitForServer();
    process.exitCode = await runNode(
      [playwrightBin, "test", ...process.argv.slice(2)],
      { ...serverEnv, CROSSPOINT_E2E_EXTERNAL_SERVER:"true" },
    );
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
} finally {
  await stopServer();
  try {
    rmSync(tempDirectory, { recursive:true, force:true, maxRetries:20, retryDelay:100 });
  } catch {
    // Windows can briefly retain SQLite handles after taskkill; the OS temp directory remains safe to reap later.
  }
}
