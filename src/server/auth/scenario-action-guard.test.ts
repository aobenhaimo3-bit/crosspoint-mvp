import { describe, expect, it } from "vitest";
import { ScenarioError } from "@/server/errors";
import { assertScenarioActionAuth, isDemoDirectorAction } from "./scenario-action-guard";

describe("scenario action authentication guard", () => {
  const directorActions = ["reset", "advanceTime", "advancePhase", "finish"];

  it.each(directorActions)("allows Demo actors to execute %s", (actionType) => {
    expect(() => assertScenarioActionAuth(actionType, "demo")).not.toThrow();
    expect(isDemoDirectorAction(actionType)).toBe(true);
  });

  it.each(directorActions)("rejects formal actors from %s even when their user id matches a Demo persona", (actionType) => {
    try {
      assertScenarioActionAuth(actionType, "formal");
      throw new Error("Expected the Demo/Test command to be rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(ScenarioError);
      expect((error as ScenarioError).code).toBe("CONTROLLER_REQUIRED");
      expect((error as ScenarioError).status).toBe(403);
    }
  });

  it.each(["chooseQuestion", "saveProfile", "accept", "submitPosition", "submitResponse", "submitPeerRating"])(
    "does not block formal business action %s",
    (actionType) => {
      expect(isDemoDirectorAction(actionType)).toBe(false);
      expect(() => assertScenarioActionAuth(actionType, "formal")).not.toThrow();
    },
  );
});
