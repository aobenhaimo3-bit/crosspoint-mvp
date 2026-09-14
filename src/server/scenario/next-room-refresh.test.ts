import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { INITIAL_DEMO_USER_IDS, positionDrafts, type PersonaId } from "@/data/demo";
import { SqliteScenarioRepository } from "@/repositories/scenario";
import { ScenarioError } from "@/server/errors";
import { ScenarioService } from "./service";

const START = new Date("2026-09-15T01:00:00.000Z");
const FOUR_USERS = [...INITIAL_DEMO_USER_IDS];
const temporaryDirectories: string[] = [];

function expectScenarioError(action: () => unknown, code: string, status: number): void {
  try {
    action();
    throw new Error(`Expected ScenarioError ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(ScenarioError);
    expect((error as ScenarioError).code).toBe(code);
    expect((error as ScenarioError).status).toBe(status);
  }
}

function createHarness(now: () => Date = () => START) {
  const repository = new SqliteScenarioRepository({ path: ":memory:" });
  const service = new ScenarioService(repository, { now });
  const id = `next-room-${Math.random().toString(36).slice(2)}`;
  service.ensureDemoScenario(id);
  service.act(id, "finance", { type: "chooseQuestion", questionId: "q-ai-major" });
  return { id, repository, service };
}

function completeDiscussion(service: ScenarioService, id: string): void {
  FOUR_USERS.forEach((userId) => service.act(id, userId, { type: "accept" }));
  service.act(id, "finance", { type: "start" });
  FOUR_USERS.forEach((userId) => {
    const draft = positionDrafts[userId];
    service.act(id, userId, {
      type: "submitPosition",
      judgment: draft.judgment,
      reasons: [draft.reason],
      evidence: [draft.evidence],
      uncertainties: [draft.uncertainty],
    });
  });
  const targets: Record<PersonaId, PersonaId> = {
    finance: "computer",
    computer: "recruiter",
    recruiter: "educator",
    educator: "finance",
    practitioner: "finance",
  };
  FOUR_USERS.forEach((userId) => service.act(id, userId, {
    type: "submitResponse",
    targetPositionId: `position-${targets[userId]}`,
    relation: "complementary",
    content: `${userId} 对另一种专业视角的回应。`,
  }));
  service.act(id, "finance", { type: "advanceTime", hours: 12 });
}

afterEach(() => {
  while (temporaryDirectories.length) {
    const directory = temporaryDirectories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

describe("next-room recommendations and refresh cooldown", () => {
  it("rejects refresh before completion and for an identity outside the scenario", () => {
    const { id, repository, service } = createHarness();
    try {
      expectScenarioError(
        () => service.act(id, "finance", { type: "refreshNextRooms" }),
        "TRANSITION_CONFLICT",
        409,
      );
      expectScenarioError(
        () => service.act(id, "not-a-scenario-member", { type: "refreshNextRooms" }),
        "NOT_MEMBER",
        403,
      );
    } finally {
      repository.close();
    }
  });

  it("offers only successfully matched rooms after a completed discussion", () => {
    const { id, repository, service } = createHarness();
    try {
      completeDiscussion(service, id);
      const view = service.getView(id, "finance");
      expect(view.room.state).toBe("ENDED");
      expect(view.nextRoomRecommendations.length).toBeGreaterThan(0);
      expect(view.nextRoomRecommendations.every((room) => room.id.startsWith("next-0-"))).toBe(true);
      expect(view.nextRoomRecommendations.every((room) => room.questionId !== "q-ai-major")).toBe(true);
      expect(view.nextRoomRecommendations.every((room) => room.memberCount >= 3)).toBe(true);
      expect(view.nextRoomRecommendations.every((room) => room.perspectiveLabels.length > 0)).toBe(true);
    } finally {
      repository.close();
    }
  });

  it("changes the persisted recommendation generation after refresh", () => {
    const { id, repository, service } = createHarness();
    try {
      completeDiscussion(service, id);
      const before = service.getView(id, "finance").nextRoomRecommendations;
      const refreshed = service.act(id, "finance", { type: "refreshNextRooms" });
      expect(refreshed.nextRoomRecommendations.length).toBeGreaterThan(0);
      expect(refreshed.nextRoomRecommendations.map((room) => room.id))
        .not.toEqual(before.map((room) => room.id));
      expect(refreshed.nextRoomRecommendations.every((room) => room.id.startsWith("next-1-"))).toBe(true);
      expect(service.getView(id, "finance").nextRoomRecommendations).toEqual(refreshed.nextRoomRecommendations);
    } finally {
      repository.close();
    }
  });

  it("returns 429 when the same identity refreshes again within five minutes", () => {
    let now = START;
    const { id, repository, service } = createHarness(() => now);
    try {
      completeDiscussion(service, id);
      const first = service.act(id, "finance", { type: "refreshNextRooms" });
      expect(first.nextRoomRefreshAvailableAt).toBe("2026-09-15T01:05:00.000Z");
      now = new Date(START.getTime() + 4 * 60_000 + 59_000);
      expectScenarioError(
        () => service.act(id, "finance", { type: "refreshNextRooms" }),
        "RATE_LIMITED",
        429,
      );
    } finally {
      repository.close();
    }
  });

  it("isolates the five-minute cooldown between identities", () => {
    const { id, repository, service } = createHarness();
    try {
      completeDiscussion(service, id);
      const finance = service.act(id, "finance", { type: "refreshNextRooms" });
      expect(finance.nextRoomRefreshAvailableAt).toBeDefined();
      expect(service.getView(id, "computer").nextRoomRefreshAvailableAt).toBeUndefined();

      const computer = service.act(id, "computer", { type: "refreshNextRooms" });
      expect(computer.nextRoomRefreshAvailableAt).toBeDefined();
      expect(computer.nextRoomRecommendations.every((room) => room.id.startsWith("next-1-"))).toBe(true);
      expectScenarioError(
        () => service.act(id, "finance", { type: "refreshNextRooms" }),
        "RATE_LIMITED",
        429,
      );
    } finally {
      repository.close();
    }
  });

  it("keeps the cooldown after rebuilding the service from SQLite", () => {
    const directory = mkdtempSync(join(tmpdir(), "crosspoint-next-room-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "scenario.sqlite");
    const id = "next-room-persistent-cooldown";
    const firstRepository = new SqliteScenarioRepository({ path: databasePath });
    const firstService = new ScenarioService(firstRepository, { now: () => START });
    firstService.ensureDemoScenario(id);
    firstService.act(id, "finance", { type: "chooseQuestion", questionId: "q-ai-major" });
    completeDiscussion(firstService, id);
    firstService.act(id, "finance", { type: "refreshNextRooms" });
    firstRepository.close();

    const restoredRepository = new SqliteScenarioRepository({ path: databasePath });
    try {
      const restoredService = new ScenarioService(restoredRepository, {
        now: () => new Date(START.getTime() + 2 * 60_000),
      });
      const restored = restoredService.getView(id, "finance");
      expect(restored.nextRoomRefreshAvailableAt).toBe("2026-09-15T01:05:00.000Z");
      expect(restored.nextRoomRecommendations.every((room) => room.id.startsWith("next-1-"))).toBe(true);
      expectScenarioError(
        () => restoredService.act(id, "finance", { type: "refreshNextRooms" }),
        "RATE_LIMITED",
        429,
      );
    } finally {
      restoredRepository.close();
    }
  });
});
