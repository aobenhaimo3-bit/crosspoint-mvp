import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import process from "node:process";

const command = process.argv[2] ?? "dev";
if (!["dev", "build", "start"].includes(command)) {
  console.error(`Unsupported Next.js command: ${command}`);
  process.exit(1);
}

const nextBin = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
const demoSessionSecret = process.env.DEMO_SESSION_SECRET || randomBytes(32).toString("base64url");
const child = spawn(process.execPath, [nextBin, command, ...process.argv.slice(3)], {
  stdio: "inherit",
  env: { ...process.env, DEMO_MODE: "true", DEMO_SESSION_SECRET: demoSessionSecret },
});

let shuttingDown = false;
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    shuttingDown = true;
    child.kill(signal);
  });
}
child.on("exit", (code) => process.exit(code ?? (shuttingDown ? 0 : 1)));
