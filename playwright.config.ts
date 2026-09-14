import path from "node:path";
import { randomBytes } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";

const port = 3100;
const baseURL = `http://localhost:${port}`;
const databasePath = path.resolve(".data", `playwright-e2e-${process.pid}.sqlite`);
const externalServer = process.env.CROSSPOINT_E2E_EXTERNAL_SERVER === "true";
const fallbackDemoSecret = randomBytes(32).toString("base64url");

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL,
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "system-edge",
      use: { ...devices["Desktop Edge"], channel: "msedge" },
    },
  ],
  webServer: externalServer ? undefined : {
    command: `node node_modules/next/dist/bin/next start -p ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      DEMO_MODE: "true",
      DEMO_SESSION_SECRET: fallbackDemoSecret,
      CROSSPOINT_DB_PATH: databasePath,
    },
  },
});
