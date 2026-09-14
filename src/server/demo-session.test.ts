import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { resolveScenarioActor } from "./auth";
import { getDemoSessionSecret } from "./demo-session";
import { ScenarioError } from "./errors";

const originalMode = process.env.DEMO_MODE;
const originalSecret = process.env.DEMO_SESSION_SECRET;

afterEach(() => {
  if (originalMode === undefined) delete process.env.DEMO_MODE;
  else process.env.DEMO_MODE = originalMode;
  if (originalSecret === undefined) delete process.env.DEMO_SESSION_SECRET;
  else process.env.DEMO_SESSION_SECRET = originalSecret;
});

describe("Demo authentication production gate", () => {
  it("refuses Demo signing whenever DEMO_MODE is not explicitly true", () => {
    process.env.DEMO_MODE = "false";
    try {
      getDemoSessionSecret();
      throw new Error("Expected Demo auth to be disabled");
    } catch (error) {
      expect(error).toBeInstanceOf(ScenarioError);
      expect((error as ScenarioError).code).toBe("DEMO_DISABLED");
      expect((error as ScenarioError).status).toBe(503);
    }
  });

  it("does not accept a Demo authorization header in formal mode", () => {
    process.env.DEMO_MODE = "false";
    const request = new NextRequest("http://localhost/api/scenarios/example", {
      headers: { Authorization: "Demo deliberately-invalid-token" },
    });
    try {
      resolveScenarioActor(request);
      throw new Error("Expected a formal session requirement");
    } catch (error) {
      expect(error).toBeInstanceOf(ScenarioError);
      expect((error as ScenarioError).code).toBe("SESSION_REQUIRED");
      expect((error as ScenarioError).status).toBe(401);
    }
  });
});
