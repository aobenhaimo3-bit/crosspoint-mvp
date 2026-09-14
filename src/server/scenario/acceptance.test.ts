import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { INITIAL_DEMO_USER_IDS, positionDrafts, type PersonaId } from "@/data/demo";
import { SqliteScenarioRepository } from "@/repositories/scenario";
import { createDemoSessionToken, verifyDemoSessionToken } from "@/server/demo-session";
import { ScenarioError, type ScenarioErrorCode } from "@/server/errors";
import { ScenarioService } from "@/server/scenario";

const NOW = new Date("2026-09-14T02:00:00.000Z");
const SESSION_SECRET = "crosspoint-acceptance-test-secret-at-least-32-characters";
const FOUR_USERS = [...INITIAL_DEMO_USER_IDS];

function createHarness(id = `scenario-${Math.random().toString(36).slice(2)}`, confirmQuestion = true) {
  const repository = new SqliteScenarioRepository({ path: ":memory:" });
  const service = new ScenarioService(repository, { now: () => NOW });
  service.ensureDemoScenario(id);
  if (confirmQuestion) service.act(id, "finance", { type:"chooseQuestion", questionId:"q-ai-major" });
  return { id, repository, service };
}

function expectScenarioError(action: () => unknown, code: ScenarioErrorCode, status?: number): void {
  try {
    action();
    throw new Error(`Expected ScenarioError ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(ScenarioError);
    expect((error as ScenarioError).code).toBe(code);
    if (status !== undefined) expect((error as ScenarioError).status).toBe(status);
  }
}

function acceptAll(service: ScenarioService, id: string, users: readonly PersonaId[] = FOUR_USERS): void {
  users.forEach((userId) => service.act(id, userId, { type: "accept" }));
}

function submitPosition(service: ScenarioService, id: string, userId: PersonaId): void {
  const draft = positionDrafts[userId];
  service.act(id, userId, {
    type: "submitPosition",
    judgment: draft.judgment,
    reasons: [draft.reason],
    evidence: [draft.evidence],
    uncertainties: [draft.uncertainty],
  });
}

function completeFourUserDiscussion(service: ScenarioService, id: string): void {
  acceptAll(service, id);
  service.act(id, "finance", { type: "start" });
  FOUR_USERS.forEach((userId) => submitPosition(service, id, userId));
  const targets: Record<PersonaId, PersonaId> = {
    finance: "computer", computer: "recruiter", recruiter: "educator", educator: "finance", practitioner: "finance",
  };
  FOUR_USERS.forEach((userId) => service.act(id, userId, {
    type: "submitResponse",
    targetPositionId: `position-${targets[userId]}`,
    relation: "complementary",
    content: `${userId} 的异步聊天回复。`,
  }));
  service.act(id, "finance", { type: "advanceTime", hours: 12 });
}

describe("CrossPoint scenario acceptance", () => {
  it("allows a user to save valid matching tags before selecting a question", () => {
    const { id, repository, service } = createHarness(undefined, false);
    try {
      const profile = service.ensureDemoScenario(id).profiles.find((item) => item.id === "computer")!;
      const saved = service.act(id, "computer", { type: "saveProfile", profile: { ...profile, displayName: "周屿·标签已确认" } });
      expect(saved.questionConfirmed).toBe(false);
      expect(saved.profiles.find((item) => item.id === "computer")?.displayName).toBe("周屿·标签已确认");
      expectScenarioError(() => service.act(id, "computer", { type: "accept" }), "INVALID_INPUT", 409);
    } finally {
      repository.close();
    }
  });

  it("rejects invalid or intent-forged profile tags without changing persisted state", () => {
    const { id, repository, service } = createHarness(undefined, false);
    try {
      const before = service.ensureDemoScenario(id).profiles.find((item) => item.id === "computer")!;
      const unknown = {
        ...before,
        displayName: "不应保存的名称",
        tags: before.tags.map((tag, index) => index === 0 ? { ...tag, tagId:"topic.not-real" } : tag),
      };
      expectScenarioError(() => service.act(id, "computer", { type:"saveProfile", profile:unknown }), "INVALID_INPUT", 400);
      expect(service.ensureDemoScenario(id).profiles.find((item) => item.id === "computer")).toEqual(before);

      const forged = {
        ...before,
        tags: [
          ...before.tags.filter((tag) => tag.intent !== "topic"),
          ...["role.student", "role.engineer", "role.teacher"].map((tagId) => ({ ...before.tags[0]!, tagId, intent:"topic" as const })),
        ],
      };
      expectScenarioError(() => service.act(id, "computer", { type:"saveProfile", profile:forged }), "INVALID_INPUT", 400);
      expect(service.ensureDemoScenario(id).profiles.find((item) => item.id === "computer")).toEqual(before);
    } finally {
      repository.close();
    }
  });

  it("requires a confirmed question before matching or invitation actions", () => {
    const { id, repository, service } = createHarness(undefined, false);
    try {
      expect(service.getView(id, "finance").questionConfirmed).toBe(false);
      expectScenarioError(() => service.act(id, "finance", { type:"accept" }), "INVALID_INPUT", 409);
      const confirmed = service.act(id, "finance", { type:"chooseQuestion", questionId:"q-ai-major" });
      expect(confirmed.questionConfirmed).toBe(true);
      expect(service.act(id, "finance", { type:"accept" }).room.members).toContainEqual({ userId:"finance", status:"accepted" });
    } finally {
      repository.close();
    }
  });

  it("isolates four signed Demo identities and private independent positions", () => {
    const { id, repository, service } = createHarness();
    try {
      const tokens = FOUR_USERS.map((personaId) =>
        createDemoSessionToken({ scenarioId: id, personaId }, SESSION_SECRET, NOW.getTime()),
      );
      const claims = tokens.map(({ token }) => verifyDemoSessionToken(token, SESSION_SECRET, NOW.getTime() + 1));
      expect(new Set(tokens.map(({ token }) => token)).size).toBe(4);
      expect(claims.map((claim) => claim.personaId)).toEqual(FOUR_USERS);
      expect(claims.every((claim) => claim.scenarioId === id)).toBe(true);
      const [payload, signature] = tokens[0]!.token.split(".");
      const alteredClaims = { ...claims[0]!, personaId: "computer" };
      const alteredPayload = Buffer.from(JSON.stringify(alteredClaims), "utf8").toString("base64url");
      expectScenarioError(
        () => verifyDemoSessionToken(`${alteredPayload}.${signature ?? payload}`, SESSION_SECRET, NOW.getTime() + 1),
        "SESSION_INVALID",
        401,
      );

      acceptAll(service, id);
      service.act(id, "finance", { type: "start" });
      submitPosition(service, id, "finance");

      const own = service.getView(id, "finance").room.positions[0];
      const other = service.getView(id, "computer").room.positions[0];
      const reserveView = service.getView(id, "practitioner");
      expect(own).toMatchObject({ authorId: "finance", judgment: positionDrafts.finance.judgment });
      expect(other).toEqual({ id: "position-finance", authorId: "finance", submitted: true });
      expect(other).not.toHaveProperty("judgment");
      expect(reserveView.room.positions[0]).toEqual({ id: "position-finance", authorId: "finance", submitted: true });
      expect(reserveView.match.members.every((member) => !("score" in member))).toBe(true);
    } finally {
      repository.close();
    }
  });

  it("maps a natural-language opening to a minimal private PositionCard", () => {
    const { id, repository, service } = createHarness();
    try {
      acceptAll(service, id);
      service.act(id, "finance", { type: "start" });
      const content = "企业可能更需要能在 AI 建议与现实责任之间作判断的人。";

      const ownView = service.act(id, "finance", { type: "submitPosition", content });
      expect(ownView.room.positions).toContainEqual(expect.objectContaining({
        id: "position-finance",
        authorId: "finance",
        judgment: content,
        reasons: [],
        evidence: [],
        uncertainties: [],
      }));

      expect(service.getView(id, "computer").room.positions).toContainEqual({
        id: "position-finance",
        authorId: "finance",
        submitted: true,
      });
      expect(service.getView(id, "computer").room.positions[0]).not.toHaveProperty("judgment");
    } finally {
      repository.close();
    }
  });

  it("rejects a known profile that is not invited to the room", () => {
    const { id, repository, service } = createHarness();
    try {
      expectScenarioError(() => service.act(id, "practitioner", { type: "accept" }), "NOT_MEMBER", 403);
      expectScenarioError(
        () => submitPosition(service, id, "practitioner"),
        "NOT_MEMBER",
        403,
      );
      expectScenarioError(() => service.getView(id, "forged-persona"), "NOT_MEMBER", 403);
    } finally {
      repository.close();
    }
  });

  it("opens only after at least three members accept", () => {
    const { id, repository, service } = createHarness();
    try {
      service.act(id, "finance", { type: "accept" });
      service.act(id, "educator", { type: "accept" });
      expect(service.getView(id, "finance").room.state).toBe("WAITING_ACCEPTANCE");
      expectScenarioError(() => service.act(id, "finance", { type: "start" }), "TRANSITION_CONFLICT", 409);

      service.act(id, "recruiter", { type: "accept" });
      expect(service.getView(id, "finance").room.state).toBe("OPEN");
      expectScenarioError(() => service.act(id, "finance", { type: "start" }), "TRANSITION_CONFLICT", 409);
      service.act(id, "computer", { type: "accept" });
      expect(service.act(id, "finance", { type: "start" }).room.state).toBe("INDEPENDENT");
    } finally {
      repository.close();
    }
  });

  it("restricts director commands to the controller identity", () => {
    const { id, repository, service } = createHarness();
    try {
      expectScenarioError(() => service.act(id, "computer", { type: "advanceTime", hours: 12 }), "CONTROLLER_REQUIRED", 403);
      expectScenarioError(() => service.act(id, "computer", { type: "reset" }), "CONTROLLER_REQUIRED", 403);
      acceptAll(service, id);
      service.act(id, "finance", { type: "start" });
      expectScenarioError(() => service.act(id, "computer", { type: "advancePhase" }), "CONTROLLER_REQUIRED", 403);
    } finally {
      repository.close();
    }
  });

  it.each([
    ["decline", "educator"] as const,
    ["timeout", "computer"] as const,
  ])("uses the sole practitioner reserve after %s and adds the industry perspective", (kind, departedId) => {
    const { id, repository, service } = createHarness();
    try {
      if (kind === "timeout") {
        (["finance", "recruiter", "educator"] as const).forEach((userId) =>
          service.act(id, userId, { type: "accept" }),
        );
      }
      const view = kind === "decline"
        ? service.act(id, departedId, { type: "decline", reason: "rejected" })
        : service.act(id, "finance", { type: "advanceTime", hours: 12 });
      expect(view.room.members).toContainEqual({ userId: "practitioner", status: "invited" });
      expect(view.room.members.some((member) => member.userId === departedId)).toBe(false);
      expect(view.room.perspectiveKinds.practitioner).toContain("industry");
      expect(view.match.members.some((member) => member.userId === "practitioner")).toBe(true);
    } finally {
      repository.close();
    }
  });

  it("enforces phase gates and rejects duplicate position submission", () => {
    const { id, repository, service } = createHarness();
    try {
      acceptAll(service, id);
      service.act(id, "finance", { type: "start" });
      expectScenarioError(
        () => service.act(id, "computer", {
          type: "submitResponse",
          targetPositionId: "position-finance",
          relation: "different",
          content: "尚未进入交叉回应。",
        }),
        "TRANSITION_CONFLICT",
        409,
      );
      submitPosition(service, id, "finance");
      expectScenarioError(() => submitPosition(service, id, "finance"), "TRANSITION_CONFLICT", 409);
      expectScenarioError(() => service.act(id, "finance", { type: "advancePhase" }), "TRANSITION_CONFLICT", 409);
      expectScenarioError(() => service.act(id, "finance", { type: "finish" }), "TRANSITION_CONFLICT", 409);
    } finally {
      repository.close();
    }
  });

  it("supports response-to-response threads while keeping new and legacy targets compatible", () => {
    const { id, repository, service } = createHarness();
    try {
      acceptAll(service, id);
      service.act(id, "finance", { type: "start" });
      FOUR_USERS.forEach((userId) => submitPosition(service, id, userId));

      const legacyReply = service.act(id, "computer", {
        type: "submitResponse",
        targetPositionId: "position-finance",
        relation: "different",
        content: "computer 使用旧字段回复 finance 的开场。",
      });
      const computerResponse = legacyReply.room.responses.find((response) =>
        "content" in response && response.content === "computer 使用旧字段回复 finance 的开场。",
      );
      expect(computerResponse).toMatchObject({ authorId: "computer", targetMessageId: "position-finance" });

      const threaded = service.act(id, "finance", {
        type: "submitResponse",
        targetMessageId: computerResponse!.id,
        relation: "complementary",
        content: "finance 使用新字段直接回复 computer 的回应。",
      });
      expect(threaded.room.responses).toContainEqual(expect.objectContaining({
        authorId: "finance",
        targetMessageId: computerResponse!.id,
        content: "finance 使用新字段直接回复 computer 的回应。",
      }));

      const samePersonDifferentMessage = service.act(id, "finance", {
        type: "submitResponse",
        targetMessageId: "position-computer",
        relation: "complementary",
        content: "finance 也可以回复 computer 的另一条消息。",
      });
      expect(samePersonDifferentMessage.room.responses.filter((response) => response.authorId === "finance")).toHaveLength(2);

      expectScenarioError(() => service.act(id, "finance", {
        type: "submitResponse",
        targetMessageId: computerResponse!.id,
        relation: "different",
        content: "同一目标消息的重复回应。",
      }), "TRANSITION_CONFLICT", 409);
      expectScenarioError(() => service.act(id, "finance", {
        type: "submitResponse",
        targetMessageId: "position-finance",
        relation: "different",
        content: "不能回复自己的开场。",
      }), "TRANSITION_CONFLICT", 409);
      expectScenarioError(() => service.act(id, "finance", {
        type: "submitResponse",
        targetMessageId: "missing-message",
        relation: "different",
        content: "不能回复未知消息。",
      }), "TRANSITION_CONFLICT", 409);

      service.act(id, "recruiter", {
        type: "submitResponse",
        targetMessageId: "position-educator",
        relation: "complementary",
        content: "recruiter 完成交叉回应。",
      });
      service.act(id, "educator", {
        type: "submitResponse",
        targetPositionId: "position-recruiter",
        relation: "complementary",
        content: "educator 通过旧字段完成交叉回应。",
      });
      const finished = service.act(id, "finance", { type: "advanceTime", hours: 12 });
      expect(finished.perspectiveMap?.edges.find((edge) => edge.content === "finance 使用新字段直接回复 computer 的回应。"))
        .toMatchObject({ fromUserId: "finance", toUserId: "computer" });
    } finally {
      repository.close();
    }
  });

  it("persists private peer ratings, exposes aggregates only, and feeds the profile matching signal", () => {
    const { id, repository, service } = createHarness();
    try {
      expectScenarioError(() => service.act(id, "finance", {
        type: "submitPeerRating", targetUserId: "computer", suitability: 5, inspiration: 4,
      }), "TRANSITION_CONFLICT", 409);
      completeFourUserDiscussion(service, id);
      const before = service.ensureDemoScenario(id).profiles.find((profile) => profile.id === "computer")!.conversationReputation!;
      const rated = service.act(id, "finance", {
        type: "submitPeerRating", targetUserId: "computer", suitability: 5, inspiration: 4, comment: "适合继续聊系统与人的边界。",
      });
      const aggregate = rated.ratingAggregates.find((item) => item.userId === "computer")!;
      expect(aggregate.count).toBe(before.count + 1);
      expect(rated.myRatingTargetIds).toContain("computer");
      expect(rated).not.toHaveProperty("peerRatings");
      expect(JSON.stringify(rated)).not.toContain("适合继续聊系统与人的边界");
      expectScenarioError(() => service.act(id, "finance", {
        type: "submitPeerRating", targetUserId: "computer", suitability: 3, inspiration: 3,
      }), "TRANSITION_CONFLICT", 409);
      expectScenarioError(() => service.act(id, "finance", {
        type: "submitPeerRating", targetUserId: "finance", suitability: 5, inspiration: 5,
      }), "INVALID_INPUT", 400);
      expectScenarioError(() => service.act(id, "finance", {
        type: "submitPeerRating", targetUserId: "computer", suitability: 6, inspiration: 5,
      }), "INVALID_INPUT", 400);
    } finally {
      repository.close();
    }
  });

  it("reveals Zhihu handles only after the other participant accepts the exchange request", () => {
    const { id, repository, service } = createHarness();
    try {
      completeFourUserDiscussion(service, id);
      const requested = service.act(id, "finance", { type: "requestConnection", targetUserId: "computer" });
      expect(requested.connections.find((item) => item.userId === "computer")).toEqual({ userId: "computer", status: "outgoing_pending" });
      expect(service.getView(id, "computer").connections.find((item) => item.userId === "finance")).toEqual({ userId: "finance", status: "incoming_pending" });
      const accepted = service.act(id, "computer", { type: "respondConnection", requesterUserId: "finance", accept: true });
      expect(accepted.connections.find((item) => item.userId === "finance")).toMatchObject({ status: "accepted", zhihuHandle: "demo_finance" });
      expect(service.getView(id, "finance").connections.find((item) => item.userId === "computer")).toMatchObject({ status: "accepted", zhihuHandle: "demo_computer" });
      expect(service.getView(id, "educator").connections.find((item) => item.userId === "computer")).toEqual({ userId: "computer", status: "none" });
      expectScenarioError(() => service.act(id, "finance", { type: "requestConnection", targetUserId: "computer" }), "TRANSITION_CONFLICT", 409);
    } finally {
      repository.close();
    }
  });

  it("advances the simulated clock without bypassing incomplete room phases", () => {
    const { id, repository, service } = createHarness();
    try {
      acceptAll(service, id);
      service.act(id, "finance", { type: "start" });
      submitPosition(service, id, "finance");

      const afterIndependentDeadline = service.act(id, "finance", { type: "advanceTime", hours: 48 });
      expect(afterIndependentDeadline.room.state).toBe("INDEPENDENT");
      expect(afterIndependentDeadline.room.summary).toBeUndefined();

      (["computer", "recruiter", "educator"] as const).forEach((userId) => submitPosition(service, id, userId));
      const gatedCross = service.act(id, "finance", { type: "advanceTime", hours: 1 });
      expect(gatedCross.room.state).toBe("CROSS_RESPONSE");

      service.act(id, "finance", {
        type: "submitResponse",
        targetPositionId: "position-computer",
        relation: "different",
        content: "只有一人回应时，时间也不能跳到总结。",
      });
      const afterCrossDeadline = service.act(id, "finance", { type: "advanceTime", hours: 1 });
      expect(afterCrossDeadline.room.state).toBe("CROSS_RESPONSE");
      expect(afterCrossDeadline.room.summary).toBeUndefined();
    } finally {
      repository.close();
    }
  });

  it("auto-opens replies after the last opening and finishes only after the expired round is complete", () => {
    const { id, repository, service } = createHarness();
    try {
      acceptAll(service, id);
      service.act(id, "finance", { type: "start" });
      (["finance", "computer", "recruiter"] as const).forEach((userId) => submitPosition(service, id, userId));
      expect(service.getView(id, "finance").room.state).toBe("INDEPENDENT");

      const openedReplies = service.act(id, "educator", {
        type: "submitPosition",
        content: "educator 提交最后一条独立发言。",
      });
      expect(openedReplies.room.state).toBe("CROSS_RESPONSE");

      const targets = { finance:"computer", computer:"recruiter", recruiter:"educator" } as const;
      (["finance", "computer", "recruiter"] as const).forEach((userId) => service.act(id, userId, {
        type: "submitResponse",
        targetPositionId: `position-${targets[userId]}`,
        relation: "complementary",
        content: `${userId} 在截止前完成回应。`,
      }));

      const expiredButIncomplete = service.act(id, "finance", { type: "advanceTime", hours: 12 });
      expect(expiredButIncomplete.room.state).toBe("CROSS_RESPONSE");
      expect(expiredButIncomplete.room.summary).toBeUndefined();

      const completedLate = service.act(id, "educator", {
        type: "submitResponse",
        targetPositionId: "position-finance",
        relation: "different",
        content: "educator 在截止后补齐最后一次有效回应。",
      });
      expect(completedLate.room).toMatchObject({ state:"ENDED", terminalReason:"COMPLETED" });
      expect(completedLate.room.summary).toBeDefined();
      expect(completedLate.perspectiveMap?.nodes).toHaveLength(4);
    } finally {
      repository.close();
    }
  });

  it("closes a completed round before rejecting the first post-deadline extra response", () => {
    let wallNow = NOW;
    const repository = new SqliteScenarioRepository({ path: ":memory:" });
    const service = new ScenarioService(repository, { now: () => wallNow });
    const id = `scenario-${Math.random().toString(36).slice(2)}`;
    try {
      service.ensureDemoScenario(id);
      service.act(id, "finance", { type:"chooseQuestion", questionId:"q-ai-major" });
      acceptAll(service, id);
      service.act(id, "finance", { type:"start" });
      FOUR_USERS.forEach((userId) => submitPosition(service, id, userId));
      const targets: Record<PersonaId, PersonaId> = {
        finance:"computer", computer:"recruiter", recruiter:"educator", educator:"finance", practitioner:"finance",
      };
      FOUR_USERS.forEach((userId) => service.act(id, userId, {
        type:"submitResponse",
        targetPositionId:`position-${targets[userId]}`,
        relation:"complementary",
        content:`${userId} 在窗口内完成回应。`,
      }));
      expect(repository.get(id)?.room.responses).toHaveLength(4);

      wallNow = new Date(NOW.getTime() + 12 * 3_600_000 + 1);
      expectScenarioError(() => service.act(id, "finance", {
        type:"submitResponse",
        targetPositionId:"position-recruiter",
        relation:"different",
        content:"这条截止后的额外消息不应进入总结。",
      }), "TRANSITION_CONFLICT", 409);

      const ended = service.getView(id, "finance");
      expect(ended.room).toMatchObject({ state:"ENDED", terminalReason:"COMPLETED" });
      expect(ended.room.responses).toHaveLength(4);
      expect(JSON.stringify(ended.room.summary)).not.toContain("这条截止后的额外消息");
      expect(JSON.stringify(ended.perspectiveMap)).not.toContain("这条截止后的额外消息");
    } finally {
      repository.close();
    }
  });

  it("allows the missing member to submit late and completes once the expired round becomes complete", () => {
    let wallNow = NOW;
    const repository = new SqliteScenarioRepository({ path: ":memory:" });
    const service = new ScenarioService(repository, { now: () => wallNow });
    const id = `scenario-${Math.random().toString(36).slice(2)}`;
    try {
      service.ensureDemoScenario(id);
      service.act(id, "finance", { type:"chooseQuestion", questionId:"q-ai-major" });
      acceptAll(service, id);
      service.act(id, "finance", { type:"start" });
      FOUR_USERS.forEach((userId) => submitPosition(service, id, userId));
      const targets = { finance:"computer", computer:"recruiter", recruiter:"educator" } as const;
      (Object.keys(targets) as (keyof typeof targets)[]).forEach((userId) => service.act(id, userId, {
        type:"submitResponse",
        targetPositionId:`position-${targets[userId]}`,
        relation:"complementary",
        content:`${userId} 在截止前完成回应。`,
      }));

      wallNow = new Date(NOW.getTime() + 12 * 3_600_000 + 1);
      const completed = service.act(id, "educator", {
        type:"submitResponse",
        targetPositionId:"position-finance",
        relation:"different",
        content:"educator 在截止后补齐唯一缺失的回应。",
      });

      expect(completed.room).toMatchObject({ state:"ENDED", terminalReason:"COMPLETED" });
      expect(completed.room.responses).toHaveLength(4);
      expect(completed.room.summary).toBeDefined();
      expect(completed.perspectiveMap?.edges.some((edge) => edge.content.includes("截止后补齐"))).toBe(true);
    } finally {
      repository.close();
    }
  });

  it("keeps a completed discussion open until wall-clock expiry, then lazily persists the recap", () => {
    let wallNow = NOW;
    const repository = new SqliteScenarioRepository({ path: ":memory:" });
    const service = new ScenarioService(repository, { now: () => wallNow });
    const id = `scenario-${Math.random().toString(36).slice(2)}`;
    try {
      service.ensureDemoScenario(id);
      service.act(id, "finance", { type:"chooseQuestion", questionId:"q-ai-major" });
      acceptAll(service, id);
      service.act(id, "finance", { type:"start" });
      FOUR_USERS.forEach((userId) => submitPosition(service, id, userId));
      const targets: Record<PersonaId, PersonaId> = {
        finance:"computer", computer:"recruiter", recruiter:"educator", educator:"finance", practitioner:"finance",
      };
      FOUR_USERS.forEach((userId) => service.act(id, userId, {
        type:"submitResponse",
        targetPositionId:`position-${targets[userId]}`,
        relation:"complementary",
        content:`${userId} 在 12 小时内完成必需回应。`,
      }));
      expect(service.getView(id, "computer").room.state).toBe("CROSS_RESPONSE");

      const persisted = repository.get(id)!;
      // Simulate a pre-migration record that had already entered synthesis before
      // the deadline became a domain invariant.
      repository.save({ ...persisted, room:{
        ...persisted.room,
        state:"SYNTHESIS",
        revision:persisted.room.revision + 1,
      } }, persisted.version);
      expect(service.getView(id, "computer").room.state).toBe("SYNTHESIS");

      wallNow = new Date(NOW.getTime() + 12 * 3_600_000 + 1);
      const ended = service.getView(id, "computer");
      expect(ended.room).toMatchObject({ state:"ENDED", terminalReason:"COMPLETED" });
      expect(ended.room.summary).toBeDefined();
      expect(ended.perspectiveMap).toBeDefined();

      const reloaded = new ScenarioService(repository, { now: () => wallNow }).getView(id, "finance");
      expect(reloaded.room.state).toBe("ENDED");
      expect(reloaded.room.summary).toEqual(ended.room.summary);
    } finally {
      repository.close();
    }
  });

  it("persists scenario revision and state after closing and reopening SQLite", () => {
    const directory = mkdtempSync(join(tmpdir(), "crosspoint-scenario-test-"));
    const databasePath = join(directory, "scenario.sqlite");
    const id = "persistent-scenario";
    let first: SqliteScenarioRepository | undefined;
    let second: SqliteScenarioRepository | undefined;
    try {
      first = new SqliteScenarioRepository({ path: databasePath });
      const firstService = new ScenarioService(first, { now: () => NOW });
      firstService.ensureDemoScenario(id);
      firstService.act(id, "finance", { type:"chooseQuestion", questionId:"q-ai-major" });
      acceptAll(firstService, id);
      firstService.act(id, "finance", { type: "start" });
      FOUR_USERS.forEach((userId) => submitPosition(firstService, id, userId));
      const targets: Record<PersonaId, PersonaId> = {
        finance: "computer", computer: "recruiter", recruiter: "educator", educator: "finance", practitioner: "finance",
      };
      FOUR_USERS.forEach((userId) => firstService.act(id, userId, {
        type: "submitResponse",
        targetPositionId: `position-${targets[userId]}`,
        relation: "complementary",
        content: `${userId} 的持久化交叉回应。`,
      }));
      firstService.act(id, "finance", { type: "advanceTime", hours: 12 });
      firstService.act(id, "finance", { type: "submitPeerRating", targetUserId: "computer", suitability: 5, inspiration: 4, comment: "持久化私密评价" });
      firstService.act(id, "finance", { type: "requestConnection", targetUserId: "computer" });
      const completed = firstService.act(id, "computer", { type: "respondConnection", requesterUserId: "finance", accept: true });
      const savedVersion = completed.version;
      const refreshedService = new ScenarioService(first, { now: () => NOW });
      expect(refreshedService.getView(id, "computer").version).toBe(savedVersion);
      first.close();
      first = undefined;

      second = new SqliteScenarioRepository({ path: databasePath });
      const reopened = new ScenarioService(second, { now: () => new Date("2026-09-15T02:00:00.000Z") });
      const restored = reopened.getView(id, "computer");
      expect(restored.version).toBe(savedVersion);
      expect(restored.room.state).toBe("ENDED");
      expect(restored.room.members).toContainEqual({ userId: "finance", status: "active" });
      expect(restored.room.positions).toHaveLength(4);
      expect(restored.room.responses).toHaveLength(4);
      expect(restored.room.summary?.consensus.join(" ")).toContain(positionDrafts.finance.judgment);
      expect(restored.perspectiveMap?.nodes).toHaveLength(4);
      expect(restored.ratingAggregates.find((item) => item.userId === "computer")?.count).toBeGreaterThan(13);
      expect(restored.connections.find((item) => item.userId === "finance")).toMatchObject({ status: "accepted", zhihuHandle: "demo_finance" });
      expect(JSON.stringify(restored)).not.toContain("持久化私密评价");
      expect(restored.virtualNow).toBe("2026-09-15T14:00:00.000Z");
    } finally {
      first?.close();
      second?.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("completes the real Demo path through timeout replacement, four-person discussion, synthesis, and map", () => {
    const { id, repository, service } = createHarness("four-user-complete-flow");
    try {
      const activeUsers = ["finance", "recruiter", "educator", "practitioner"] as const;
      (["finance", "recruiter", "educator"] as const).forEach((userId) =>
        service.act(id, userId, { type: "accept" }),
      );
      const replaced = service.act(id, "finance", { type: "advanceTime", hours: 12 });
      expect(replaced.room.members).toContainEqual({ userId: "practitioner", status: "invited" });
      expect(replaced.room.perspectiveKinds.practitioner).toContain("industry");
      expectScenarioError(() => service.act(id, "computer", { type: "accept" }), "NOT_MEMBER", 403);
      service.act(id, "practitioner", { type: "accept" });
      expect(service.act(id, "finance", { type: "start" }).room.state).toBe("INDEPENDENT");
      const customJudgment = "自定义判断：专业价值将转向问题定义、证据判断与结果责任。";
      const financeDraft = positionDrafts.finance;
      service.act(id, "finance", {
        type: "submitPosition",
        judgment: customJudgment,
        reasons: [financeDraft.reason],
        evidence: [financeDraft.evidence],
        uncertainties: [financeDraft.uncertainty],
      });
      (["recruiter", "educator", "practitioner"] as const).forEach((userId) =>
        submitPosition(service, id, userId),
      );

      expect(service.getView(id, "finance").room.state).toBe("CROSS_RESPONSE");
      for (const userId of activeUsers) {
        const revealed = service.getView(id, userId).room.positions;
        expect(revealed).toHaveLength(4);
        expect(revealed.every((position) => "judgment" in position)).toBe(true);
      }
      const targets: Record<(typeof activeUsers)[number], (typeof activeUsers)[number]> = {
        finance: "recruiter",
        recruiter: "educator",
        educator: "practitioner",
        practitioner: "finance",
      };
      const respond = (userId: (typeof activeUsers)[number]) => {
        service.act(id, userId, {
          type: "submitResponse",
          targetPositionId: `position-${targets[userId]}`,
          relation: userId === "finance" ? "different" : "complementary",
          content: `${userId} 对另一视角的交叉回应。`,
        });
      };
      respond("finance");
      const continued = service.act(id, "finance", {
        type: "submitResponse",
        targetPositionId: "position-educator",
        relation: "complementary",
        content: "finance 对第二位成员的后续异步回复。",
      });
      expect(continued.room.responses.filter((response) => response.authorId === "finance")).toHaveLength(2);
      expectScenarioError(() => respond("finance"), "TRANSITION_CONFLICT", 409);
      (["recruiter", "educator", "practitioner"] as const).forEach(respond);

      expect(service.getView(id, "finance").room.state).toBe("CROSS_RESPONSE");
      const finished = service.act(id, "finance", { type: "advanceTime", hours: 12 });
      expect(finished.room.state).toBe("ENDED");
      expect(finished.room.terminalReason).toBe("COMPLETED");
      expect(finished.room.positions).toHaveLength(4);
      expect(finished.room.responses).toHaveLength(5);
      expect(finished.room.summary?.consensus.join(" ")).toContain(customJudgment);
      expect(finished.perspectiveMap?.nodes).toHaveLength(4);
      expect(finished.perspectiveMap?.vacancies.some((vacancy) => vacancy.slotId === "industry")).toBe(false);
      expect(finished.perspectiveMap?.vacancies.some((vacancy) => vacancy.slotId === "technical")).toBe(true);
      const departedView = service.getView(id, "computer");
      expect(departedView.room.positions.every((position) => "submitted" in position)).toBe(true);
      expect(departedView.room.summary).toBeUndefined();
      expect(departedView.perspectiveMap).toBeUndefined();
    } finally {
      repository.close();
    }
  });
});
