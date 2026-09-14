import { describe, expect, it } from "vitest";
import type { DiscussionSpec, ProfileTag, UserProfile } from "./models";
import { matchDiscussion, replaceMatchMember } from "./matching";
import { validateProfileGate } from "./profile";
import { createRoom, transitionRoom } from "./room";
import { buildPerspectiveMap } from "./summary";
import { mapFreeTextToStandardTags } from "./tags";

const NOW = new Date("2026-09-14T12:00:00.000Z");
const active = (tagId: string, intent: ProfileTag["intent"], confidence = 0.9): ProfileTag => ({
  tagId, intent, confidence, source: "self", visibility: "matching_only", confirmed: true, matchingAllowed: true,
});

function profile(id: string, perspective: string, evidence: string, learn: string): UserProfile {
  return {
    id,
    displayName: id,
    source: "demo",
    registered: true,
    matchingConsent: true,
    responseProbability: 0.8,
    completionRate: 0.8,
    blockedUserIds: [],
    availability: [{ timezone: "UTC", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], startMinute: 0, endMinute: 1439, maxResponseHours: 12 }],
    tags: [
      active("topic.ai", "topic"), active("topic.education", "topic"), active("topic.employment", "topic"),
      active("role.student", "contribute"),
      active(perspective, "contribute"), active(evidence, "contribute"),
      active(learn, "learn"), active("topic.future_work", "learn"),
      active("perspective.long_term", "expected_perspective"),
    ],
  };
}

const spec: DiscussionSpec = {
  id: "spec-ai-major",
  questionId: "q-ai-major",
  question: "AI 进入工作流后，我们怎样重新定义一份值得投入的工作？",
  topicTagIds: ["topic.ai", "topic.education", "topic.employment"],
  relevantContributionTagIds: [
    "perspective.learner", "perspective.technical", "perspective.employer", "perspective.education", "perspective.industry",
    "evidence.personal", "evidence.data", "evidence.hiring", "evidence.research", "evidence.product",
  ],
  minRelevance: 0.35,
  slots: [
    { id: "learner", label: "学习者", kind: "learner", required: true, matchedByTagIds: ["perspective.learner"], learnableTagIds: ["perspective.learner"] },
    { id: "technical", label: "技术实践", kind: "technical", required: true, matchedByTagIds: ["perspective.technical"], learnableTagIds: ["perspective.technical"] },
    { id: "employer", label: "招聘", kind: "employer", required: true, matchedByTagIds: ["perspective.employer"], learnableTagIds: ["perspective.employer"] },
    { id: "education", label: "教育设计", kind: "education", required: false, matchedByTagIds: ["perspective.education"], learnableTagIds: ["perspective.education"] },
    { id: "industry", label: "行业落地", kind: "industry", required: false, matchedByTagIds: ["perspective.industry"], learnableTagIds: ["perspective.industry"] },
  ],
  problemCanCoverLearnTagIds: ["topic.future_work"],
  durationHours: 12,
  inviteExpiresHours: 12,
  minMembers: 3,
  maxMembers: 5,
};

const candidates = [
  profile("student", "perspective.learner", "evidence.personal", "perspective.employer"),
  profile("engineer", "perspective.technical", "evidence.data", "perspective.education"),
  profile("recruiter", "perspective.employer", "evidence.hiring", "perspective.technical"),
  profile("teacher", "perspective.education", "evidence.research", "perspective.industry"),
  profile("product", "perspective.industry", "evidence.product", "perspective.learner"),
];

describe("profile gate", () => {
  it("accepts the exact minimum and ignores unconfirmed suggestions", () => {
    const exact = profile("exact", "perspective.learner", "evidence.personal", "perspective.employer");
    exact.tags = [...exact.tags, { ...active("topic.university", "topic"), confirmed: false, source: "ai_suggested" }];
    expect(validateProfileGate(exact)).toMatchObject({ ok: true, errors: [] });
  });

  it("returns stable errors when a hard requirement is missing", () => {
    const invalid = profile("bad", "perspective.learner", "evidence.personal", "perspective.employer");
    invalid.tags = invalid.tags.filter((tag) => tag.intent !== "learn");
    expect(validateProfileGate(invalid).errors).toContain("LEARN_TAGS_REQUIRED");
  });

  it("rejects canonical tags whose declared intent does not match their category", () => {
    const forged = profile("forged", "perspective.learner", "evidence.personal", "perspective.employer");
    forged.tags = [
      ...forged.tags.filter((tag) => tag.intent !== "topic"),
      active("role.student", "topic"),
      active("role.engineer", "topic"),
      active("role.teacher", "topic"),
    ];
    expect(validateProfileGate(forged).errors).toEqual(expect.arrayContaining(["INVALID_TAG", "TOPIC_TAGS_REQUIRED"]));
  });
});

describe("standard tag mapping", () => {
  it("maps a natural phrase through a canonical alias and still requires confirmation downstream", () => {
    expect(mapFreeTextToStandardTags("我做过校招面试和人才筛选").map((item) => item.id)).toContain("expertise.recruiting");
  });
});

describe("deterministic matcher", () => {
  it("uses a reproducible seeded lottery after satisfying complement constraints", () => {
    const forward = matchDiscussion(candidates, spec, NOW, "scenario-a:q-ai-major");
    const reverse = matchDiscussion([...candidates].reverse(), spec, NOW, "scenario-a:q-ai-major");
    expect(forward.kind).toBe("matched");
    expect(reverse.kind).toBe("matched");
    if (forward.kind === "matched" && reverse.kind === "matched") {
      expect(forward.algorithmVersion).toBe("constraint-lottery-v1");
      expect(forward.assemblyMethod).toBe("hard-constraints-then-seeded-lottery");
      expect(forward.members.map((member) => member.userId)).toEqual(reverse.members.map((member) => member.userId));
      expect(new Set(forward.members.flatMap((member) => member.coveredSlotIds)).size).toBeGreaterThanOrEqual(3);
    }
  });

  it("consumes aggregated conversation ratings without requiring individual rating records", () => {
    const reputationCandidates = candidates.map((candidate, index) => index === 0
      ? { ...candidate, conversationReputation: { count: 20, suitability: 5, inspiration: 5 } }
      : candidate);
    const result = matchDiscussion(reputationCandidates, spec, NOW, "rating-signal");
    expect(result.kind).toBe("matched");
    if (result.kind === "matched") {
      expect(result.members.find((member) => member.userId === "student")?.score.conversationFit).toBeCloseTo(0.08);
    }
  });

  it("is invariant under candidate input order", () => {
    const forward = matchDiscussion(candidates, spec, NOW);
    const reverse = matchDiscussion([...candidates].reverse(), spec, NOW);
    expect(forward.kind).toBe("matched");
    expect(reverse.kind).toBe("matched");
    if (forward.kind === "matched" && reverse.kind === "matched") {
      expect(forward.members.map((item) => item.userId)).toEqual(reverse.members.map((item) => item.userId));
    }
  });

  it("uses 4th and 5th members only for new slots and covers diverse views", () => {
    const result = matchDiscussion(candidates, spec, NOW);
    expect(result.kind).toBe("matched");
    if (result.kind === "matched") {
      expect(result.members).toHaveLength(5);
      expect(new Set(result.coveredSlotIds).size).toBe(5);
      expect(result.members.every((item) => item.coveredLearnTagIds.length >= 1)).toBe(true);
    }
  });

  it("returns a typed degraded state instead of invented members", () => {
    const result = matchDiscussion(candidates.slice(0, 2), spec, NOW);
    expect(result).toMatchObject({ kind: "degraded", code: "INSUFFICIENT_ELIGIBLE_CANDIDATES", eligibleCount: 2 });
  });

  it("never groups users when either side has blocked the other", () => {
    const blocked = candidates.map((item) => ({
      ...item,
      blockedUserIds: candidates.filter((peer) => peer.id !== item.id).map((peer) => peer.id),
    }));
    expect(matchDiscussion(blocked, spec, NOW)).toMatchObject({ kind: "degraded", code: "BLOCK_CONFLICT" });
  });

  it("replaces a departed invite with the best unused complementary member", () => {
    const initial = matchDiscussion(candidates.slice(0, 4), spec, NOW);
    expect(initial.kind).toBe("matched");
    if (initial.kind !== "matched") return;
    const departed = initial.members.find((item) => item.coveredSlotIds.includes("education")) ?? initial.members[1];
    const replaced = replaceMatchMember(initial, departed.userId, candidates, spec, new Date(NOW.getTime() + 1_000));
    expect(replaced.kind).toBe("matched");
    if (replaced.kind === "matched") {
      expect(replaced.members.some((item) => item.userId === departed.userId)).toBe(false);
      expect(new Set(replaced.members.map((item) => item.userId)).size).toBe(replaced.members.length);
    }
  });
});

describe("room state machine", () => {
  const makeRoom = () => createRoom({
    id: "room-1", invitedUserIds: ["a", "b", "c", "d"], now: NOW,
    perspectiveKinds: { a: ["learner"], b: ["technical"], c: ["employer"], d: ["education"] },
  });

  it("opens on three accepts and follows the legal discussion path", () => {
    let room = makeRoom();
    for (const userId of ["a", "b", "c"]) {
      const result = transitionRoom(room, { type: "accept", userId, expectedRevision: room.revision }, NOW);
      expect(result.ok).toBe(true);
      if (result.ok) room = result.room;
    }
    expect(room.state).toBe("OPEN");
    let result = transitionRoom(room, { type: "decline", userId: "d", reason: "rejected", expectedRevision: room.revision }, NOW);
    if (!result.ok) throw new Error(result.message);
    room = result.room;
    result = transitionRoom(room, { type: "start", expectedRevision: room.revision }, NOW);
    if (!result.ok) throw new Error(result.message);
    room = result.room;
    expect(room.state).toBe("INDEPENDENT");
    for (const userId of ["a", "b", "c"]) {
      result = transitionRoom(room, {
        type: "submitPosition", expectedRevision: room.revision,
        card: { id: `p-${userId}`, authorId: userId, judgment: "专业仍重要", reasons: ["形成基础"], evidence: ["课程观察"], uncertainties: ["行业变化速度"] },
      }, NOW);
      if (!result.ok) throw new Error(result.message);
      room = result.room;
    }
    result = transitionRoom(room, { type: "advanceToCrossResponse", expectedRevision: room.revision }, NOW);
    if (!result.ok) throw new Error(result.message);
    room = result.room;
    for (const [authorId, targetPositionId] of [["a", "p-b"], ["b", "p-a"], ["c", "p-a"]] as const) {
      result = transitionRoom(room, {
        type: "submitCrossResponse", expectedRevision: room.revision,
        response: { id: `r-${authorId}`, authorId, targetPositionId, relation: "complementary", content: "技术变化也提高了迁移能力的重要性" },
      }, NOW);
      if (!result.ok) throw new Error(result.message);
      room = result.room;
    }
    expect(transitionRoom(room, {
      type: "advanceToSynthesis",
      expectedRevision: room.revision,
    }, NOW)).toMatchObject({ ok:false, code:"DEADLINE_NOT_REACHED" });
    expect(transitionRoom({ ...room, state:"SYNTHESIS" }, {
      type: "finish",
      expectedRevision: room.revision,
      summary: { consensus: [], disagreements: [], evidenceGaps: [], unresolvedQuestions: [] },
    }, NOW)).toMatchObject({ ok:false, code:"DEADLINE_NOT_REACHED" });
    const discussionDeadline = new Date(room.expiresAt!);
    result = transitionRoom(room, { type: "advanceToSynthesis", expectedRevision: room.revision }, discussionDeadline);
    if (!result.ok) throw new Error(result.message);
    room = result.room;
    result = transitionRoom(room, {
      type: "finish", expectedRevision: room.revision,
      summary: { consensus: ["能力组合重要"], disagreements: ["专业信号强度"], evidenceGaps: ["长期数据"], unresolvedQuestions: ["不同专业是否不同"] },
    }, discussionDeadline);
    expect(result.ok && result.room.state).toBe("ENDED");
  });

  it("accepts a non-empty natural-language opening without structured details and rejects a blank opening", () => {
    let room = makeRoom();
    for (const userId of ["a", "b", "c"]) {
      const accepted = transitionRoom(room, { type: "accept", userId, expectedRevision: room.revision }, NOW);
      if (!accepted.ok) throw new Error(accepted.message);
      room = accepted.room;
    }
    const declined = transitionRoom(room, { type: "decline", userId: "d", reason: "rejected", expectedRevision: room.revision }, NOW);
    if (!declined.ok) throw new Error(declined.message);
    const started = transitionRoom(declined.room, { type: "start", expectedRevision: declined.room.revision }, NOW);
    if (!started.ok) throw new Error(started.message);

    const naturalOpening = transitionRoom(started.room, {
      type: "submitPosition",
      expectedRevision: started.room.revision,
      card: {
        id: "natural-a",
        authorId: "a",
        judgment: "AI 进入工作流后，值得投入的工作可能更看重人与人的判断。",
        reasons: [],
        evidence: [],
        uncertainties: [],
      },
    }, NOW);
    expect(naturalOpening).toMatchObject({
      ok: true,
      room: {
        positions: [{
          id: "natural-a",
          authorId: "a",
          judgment: "AI 进入工作流后，值得投入的工作可能更看重人与人的判断。",
          reasons: [],
          evidence: [],
          uncertainties: [],
        }],
      },
    });
    if (!naturalOpening.ok) throw new Error(naturalOpening.message);

    expect(transitionRoom(naturalOpening.room, {
      type: "submitPosition",
      expectedRevision: naturalOpening.room.revision,
      card: { id: "blank-b", authorId: "b", judgment: "   ", reasons: [], evidence: [], uncertainties: [] },
    }, NOW)).toMatchObject({
      ok: false,
      code: "INVALID_SUBMISSION",
      room: { positions: [{ id: "natural-a" }] },
    });
  });

  it("rejects illegal transitions and stale revisions without mutation", () => {
    const room = makeRoom();
    const earlyStart = transitionRoom(room, { type: "start", expectedRevision: 0 }, NOW);
    expect(earlyStart).toMatchObject({ ok: false, code: "INVALID_TRANSITION", room });
    const stale = transitionRoom(room, { type: "accept", userId: "a", expectedRevision: 99 }, NOW);
    expect(stale).toMatchObject({ ok: false, code: "REVISION_CONFLICT", room });
  });

  it("requires every active member to complete each discussion phase", () => {
    let room = makeRoom();
    for (const userId of ["a", "b", "c"]) {
      const accepted = transitionRoom(room, { type: "accept", userId, expectedRevision: room.revision }, NOW);
      if (!accepted.ok) throw new Error(accepted.message);
      room = accepted.room;
    }
    const declined = transitionRoom(room, { type: "decline", userId: "d", reason: "rejected", expectedRevision: room.revision }, NOW);
    if (!declined.ok) throw new Error(declined.message);
    room = declined.room;
    const started = transitionRoom(room, { type: "start", expectedRevision: room.revision }, NOW);
    if (!started.ok) throw new Error(started.message);
    room = started.room;
    const onePosition = transitionRoom(room, {
      type: "submitPosition",
      expectedRevision: room.revision,
      card: { id: "only-a", authorId: "a", judgment: "判断", reasons: ["理由"], evidence: ["观察"], uncertainties: ["未知"] },
    }, NOW);
    if (!onePosition.ok) throw new Error(onePosition.message);
    expect(transitionRoom(onePosition.room, {
      type: "advanceToCrossResponse",
      expectedRevision: onePosition.room.revision,
    }, NOW)).toMatchObject({ ok: false, code: "INVALID_SUBMISSION" });

    room = onePosition.room;
    for (const userId of ["b", "c"]) {
      const position = transitionRoom(room, {
        type: "submitPosition",
        expectedRevision: room.revision,
        card: { id: `ready-${userId}`, authorId: userId, judgment: "判断", reasons: ["理由"], evidence: ["观察"], uncertainties: ["未知"] },
      }, NOW);
      if (!position.ok) throw new Error(position.message);
      room = position.room;
    }
    const crossed = transitionRoom(room, { type: "advanceToCrossResponse", expectedRevision: room.revision }, NOW);
    if (!crossed.ok) throw new Error(crossed.message);
    const oneResponse = transitionRoom(crossed.room, {
      type: "submitCrossResponse",
      expectedRevision: crossed.room.revision,
      response: { id: "only-response-a", authorId: "a", targetPositionId: "ready-b", relation: "different", content: "回应" },
    }, NOW);
    if (!oneResponse.ok) throw new Error(oneResponse.message);
    expect(transitionRoom(oneResponse.room, {
      type: "advanceToSynthesis",
      expectedRevision: oneResponse.room.revision,
    }, NOW)).toMatchObject({ ok: false, code: "INVALID_SUBMISSION" });
  });

  it("supports threaded replies to positions and existing responses with legacy references", () => {
    let room = makeRoom();
    for (const userId of ["a", "b", "c", "d"]) {
      const accepted = transitionRoom(room, { type: "accept", userId, expectedRevision: room.revision }, NOW);
      if (!accepted.ok) throw new Error(accepted.message);
      room = accepted.room;
    }
    const started = transitionRoom(room, { type: "start", expectedRevision: room.revision }, NOW);
    if (!started.ok) throw new Error(started.message);
    room = started.room;
    for (const userId of ["a", "b", "c", "d"]) {
      const position = transitionRoom(room, { type: "submitPosition", expectedRevision: room.revision, card: {
        id: `p-${userId}`, authorId: userId, judgment: `开场 ${userId}`, reasons: ["理由"], evidence: ["观察"], uncertainties: ["未知"],
      } }, NOW);
      if (!position.ok) throw new Error(position.message);
      room = position.room;
    }
    const crossed = transitionRoom(room, { type: "advanceToCrossResponse", expectedRevision: room.revision }, NOW);
    if (!crossed.ok) throw new Error(crossed.message);
    room = crossed.room;
    const first = transitionRoom(room, { type: "submitCrossResponse", expectedRevision: room.revision, response: {
      id: "r-b-p-a", authorId: "b", targetMessageId: "p-a", relation: "different", content: "b 回复 a 的开场",
    } }, NOW);
    if (!first.ok) throw new Error(first.message);
    room = first.room;

    const legacy = transitionRoom(room, { type: "submitCrossResponse", expectedRevision: room.revision, response: {
      id: "r-a-p-b", authorId: "a", targetPositionId: "p-b", relation: "complementary", content: "a 通过旧字段回复 b 的开场",
    } }, NOW);
    if (!legacy.ok) throw new Error(legacy.message);
    room = legacy.room;

    const threaded = transitionRoom(room, { type: "submitCrossResponse", expectedRevision: room.revision, response: {
      id: "r-a-r-b-p-a", authorId: "a", targetMessageId: "r-b-p-a", relation: "complementary", content: "a 接着回复 b 的回复",
    } }, NOW);
    if (!threaded.ok) throw new Error(threaded.message);
    room = threaded.room;

    expect(room.responses.find((response) => response.id === "r-a-p-b")).toMatchObject({ targetMessageId: "p-b" });
    expect(room.responses.find((response) => response.id === "r-a-r-b-p-a")).toMatchObject({ targetMessageId: "r-b-p-a" });
    expect(room.responses.filter((response) => response.authorId === "a")).toHaveLength(2);

    const map = buildPerspectiveMap(room, spec);
    expect(map.edges.find((edge) => edge.content === "a 接着回复 b 的回复")).toMatchObject({ fromUserId: "a", toUserId: "b" });
  });

  it("rejects self, unknown, and duplicate message targets while allowing different messages from one person", () => {
    let room = makeRoom();
    for (const userId of ["a", "b", "c", "d"]) {
      const accepted = transitionRoom(room, { type: "accept", userId, expectedRevision: room.revision }, NOW);
      if (!accepted.ok) throw new Error(accepted.message);
      room = accepted.room;
    }
    const started = transitionRoom(room, { type: "start", expectedRevision: room.revision }, NOW);
    if (!started.ok) throw new Error(started.message);
    room = started.room;
    for (const userId of ["a", "b", "c", "d"]) {
      const position = transitionRoom(room, { type: "submitPosition", expectedRevision: room.revision, card: {
        id: `p-${userId}`, authorId: userId, judgment: `开场 ${userId}`, reasons: [], evidence: [], uncertainties: [],
      } }, NOW);
      if (!position.ok) throw new Error(position.message);
      room = position.room;
    }
    const crossed = transitionRoom(room, { type: "advanceToCrossResponse", expectedRevision: room.revision }, NOW);
    if (!crossed.ok) throw new Error(crossed.message);
    room = crossed.room;

    const bRepliesA = transitionRoom(room, { type: "submitCrossResponse", expectedRevision: room.revision, response: {
      id: "r-b-p-a", authorId: "b", targetMessageId: "p-a", relation: "different", content: "b 回复 a",
    } }, NOW);
    if (!bRepliesA.ok) throw new Error(bRepliesA.message);
    room = bRepliesA.room;
    const aRepliesBPosition = transitionRoom(room, { type: "submitCrossResponse", expectedRevision: room.revision, response: {
      id: "r-a-p-b", authorId: "a", targetMessageId: "p-b", relation: "complementary", content: "a 回复 b 的开场",
    } }, NOW);
    if (!aRepliesBPosition.ok) throw new Error(aRepliesBPosition.message);
    room = aRepliesBPosition.room;
    const aRepliesBResponse = transitionRoom(room, { type: "submitCrossResponse", expectedRevision: room.revision, response: {
      id: "r-a-r-b-p-a", authorId: "a", targetMessageId: "r-b-p-a", relation: "complementary", content: "a 回复 b 的另一条消息",
    } }, NOW);
    if (!aRepliesBResponse.ok) throw new Error(aRepliesBResponse.message);
    room = aRepliesBResponse.room;

    expect(room.responses.filter((response) => response.authorId === "a")).toHaveLength(2);
    expect(transitionRoom(room, { type: "submitCrossResponse", expectedRevision: room.revision, response: {
      id: "r-a-duplicate", authorId: "a", targetMessageId: "r-b-p-a", relation: "different", content: "重复",
    } }, NOW)).toMatchObject({ ok: false, code: "ALREADY_RESPONDED" });
    expect(transitionRoom(room, { type: "submitCrossResponse", expectedRevision: room.revision, response: {
      id: "r-a-self-position", authorId: "a", targetMessageId: "p-a", relation: "different", content: "回复自己的开场",
    } }, NOW)).toMatchObject({ ok: false, code: "INVALID_SUBMISSION" });
    expect(transitionRoom(room, { type: "submitCrossResponse", expectedRevision: room.revision, response: {
      id: "r-a-self-response", authorId: "a", targetMessageId: "r-a-p-b", relation: "different", content: "回复自己的回应",
    } }, NOW)).toMatchObject({ ok: false, code: "INVALID_SUBMISSION" });
    expect(transitionRoom(room, { type: "submitCrossResponse", expectedRevision: room.revision, response: {
      id: "r-a-unknown", authorId: "a", targetMessageId: "missing-message", relation: "different", content: "未知目标",
    } }, NOW)).toMatchObject({ ok: false, code: "INVALID_SUBMISSION" });
  });

  it("starts the 12-hour discussion clock only when the room starts", () => {
    let room = makeRoom();
    expect(room.expiresAt).toBeUndefined();
    for (const userId of ["a", "b", "c"]) {
      const accepted = transitionRoom(room, { type: "accept", userId, expectedRevision: room.revision }, NOW);
      if (!accepted.ok) throw new Error(accepted.message);
      room = accepted.room;
    }
    const declined = transitionRoom(room, { type: "decline", userId: "d", reason: "rejected", expectedRevision: room.revision }, NOW);
    if (!declined.ok) throw new Error(declined.message);
    room = declined.room;
    const startedAt = new Date(NOW.getTime() + 6 * 3_600_000);
    const started = transitionRoom(room, { type: "start", expectedRevision: room.revision }, startedAt);
    expect(started.ok && started.room.expiresAt).toBe(new Date(startedAt.getTime() + 12 * 3_600_000).toISOString());
  });

  it("permits replacement before start and forbids it once independent views begin", () => {
    let room = makeRoom();
    let result = transitionRoom(room, { type: "decline", userId: "d", reason: "rejected", expectedRevision: 0 }, NOW);
    if (!result.ok) throw new Error(result.message);
    room = result.room;
    result = transitionRoom(room, { type: "replaceInvite", departedUserId: "d", replacementUserId: "e", perspectiveKinds: ["industry"], expectedRevision: room.revision }, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    room = result.room;
    for (const userId of ["a", "b", "c"]) {
      const accepted = transitionRoom(room, { type: "accept", userId, expectedRevision: room.revision }, NOW);
      if (!accepted.ok) throw new Error(accepted.message);
      room = accepted.room;
    }
    const acceptedReplacement = transitionRoom(room, { type: "accept", userId: "e", expectedRevision: room.revision }, NOW);
    if (!acceptedReplacement.ok) throw new Error(acceptedReplacement.message);
    room = acceptedReplacement.room;
    const started = transitionRoom(room, { type: "start", expectedRevision: room.revision }, NOW);
    if (!started.ok) throw new Error(started.message);
    const forbidden = transitionRoom(started.room, { type: "replaceInvite", departedUserId: "e", replacementUserId: "f", perspectiveKinds: ["research"], expectedRevision: started.room.revision }, NOW);
    expect(forbidden).toMatchObject({ ok: false, code: "INVALID_TRANSITION" });
  });
});
