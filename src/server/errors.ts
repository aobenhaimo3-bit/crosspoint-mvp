export type ScenarioErrorCode =
  | "DEMO_DISABLED" | "DEMO_NOT_CONFIGURED" | "SESSION_REQUIRED" | "SESSION_INVALID"
  | "SCENARIO_FORBIDDEN" | "NOT_MEMBER" | "CONTROLLER_REQUIRED" | "SCENARIO_NOT_FOUND"
  | "INVALID_ACTION" | "INVALID_INPUT" | "TRANSITION_CONFLICT" | "REVISION_CONFLICT" | "RATE_LIMITED";

export class ScenarioError extends Error {
  constructor(public readonly code: ScenarioErrorCode, message: string, public readonly status: number) {
    super(message);
    this.name = "ScenarioError";
  }
}
