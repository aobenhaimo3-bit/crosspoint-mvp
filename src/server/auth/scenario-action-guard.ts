import { ScenarioError } from "@/server/errors";

export type ScenarioAuthMode = "demo" | "formal";

const DEMO_DIRECTOR_ACTIONS = new Set([
  "reset",
  "advanceTime",
  "advancePhase",
  "finish",
]);

export function isDemoDirectorAction(actionType: string): boolean {
  return DEMO_DIRECTOR_ACTIONS.has(actionType);
}

/** Prevents formal identities from invoking Demo/Test-only orchestration commands. */
export function assertScenarioActionAuth(actionType: string, authMode: ScenarioAuthMode): void {
  if (isDemoDirectorAction(actionType) && authMode !== "demo") {
    throw new ScenarioError(
      "CONTROLLER_REQUIRED",
      "此操作仅在 Demo/Test 模式下允许演示导演执行。",
      403,
    );
  }
}
