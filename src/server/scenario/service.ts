import {
  allActiveMembersSubmittedPositions,
  allActiveMembersSubmittedResponses,
  buildPerspectiveMap,
  createRoom,
  deriveDiscussionHeadline,
  matchDiscussion,
  replaceMatchMember,
  recommendQuestionsForProfile,
  synthesizeDiscussion,
  transitionRoom,
  validateProfileGate,
  type MatchSuccess,
  type PositionCard,
  type Room,
  type UserProfile,
} from "@/domain";
import {
  DEMO_SCENARIO_ID,
  INITIAL_DEMO_USER_IDS,
  REPLACEMENT_DEMO_USER_ID,
  canonicalDemoProfiles,
  discussionSpecs,
  getDiscussionSpec,
  initialDemoProfiles,
} from "@/data/demo";
import { ScenarioConflictError, type ScenarioInviteStatus, type ScenarioRecord, type ScenarioRepository } from "@/repositories/scenario";
import { ScenarioError } from "../errors";
import { normalizeChatImages } from "./images";
import type { NextRoomRecommendation, ScenarioAction, ScenarioView } from "./types";

const stableHash = (value: string): number => {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

function parseOpeningMessage(content: string): Pick<PositionCard, "judgment" | "reasons" | "evidence" | "uncertainties"> {
  const trimmed = content.trim();
  const lines = trimmed.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const read = (label: string) => lines.find((line) => line.startsWith(label))?.slice(label.length).trim() ?? "";
  const judgment = read("判断：");
  if (!judgment) return { judgment: trimmed, reasons: [], evidence: [], uncertainties: [] };
  return {
    judgment,
    reasons: [read("理由：")].filter(Boolean),
    evidence: [read("证据：")].filter(Boolean),
    uncertainties: [read("不确定：")].filter(Boolean),
  };
}

export interface ScenarioServiceOptions { now?: () => Date }

const controllerId = INITIAL_DEMO_USER_IDS[0];

export class ScenarioService {
  private readonly now: () => Date;
  constructor(private readonly repository: ScenarioRepository, options: ScenarioServiceOptions = {}) {
    this.now = options.now ?? (() => new Date());
  }

  ensureDemoScenario(id = DEMO_SCENARIO_ID): ScenarioRecord {
    const existing = this.repository.get(id);
    if (existing) return existing;
    try { return this.repository.create(this.freshRecord(id, "q-ai-major", this.now(), canonicalDemoProfiles, false)); }
    catch (error) {
      if (error instanceof ScenarioConflictError) {
        const concurrent = this.repository.get(id);
        if (concurrent) return concurrent;
      }
      throw error;
    }
  }

  resetDemoScenario(id = DEMO_SCENARIO_ID): ScenarioRecord {
    const existing = this.repository.get(id);
    const fresh = this.freshRecord(id, "q-ai-major", this.now(), canonicalDemoProfiles, false);
    return existing ? this.repository.save({ ...fresh, version: existing.version, createdAt: existing.createdAt }, existing.version) : this.repository.create(fresh);
  }

  getView(scenarioId: string, viewerId: string): ScenarioView {
    let record = this.requireScenario(scenarioId);
    this.requireKnownViewer(record, viewerId);
    record = this.materializeElapsedTime(record);
    return this.toView(record, viewerId);
  }

  act(scenarioId: string, viewerId: string, action: ScenarioAction): ScenarioView {
    let record = this.requireScenario(scenarioId);
    this.requireKnownViewer(record, viewerId);
    record = this.materializeElapsedTime(record);
    const expectedVersion = record.version;
    // materializeElapsedTime always returns virtualNow at the effective wall-clock
    // instant. Recomputing from its old anchor would count the same elapsed time twice
    // when no phase transition needed persistence.
    const eventTime = new Date(record.virtualNow);

    if (action.type === "reset") {
      this.requireController(viewerId);
      return this.toView(this.resetDemoScenario(scenarioId), viewerId);
    }
    if (action.type === "chooseQuestion") {
      this.requireController(viewerId);
      this.requireReconfigurable(record.room);
      if (getDiscussionSpec(action.questionId).questionId !== action.questionId) throw new ScenarioError("INVALID_INPUT", "Unknown discussion question.", 400);
      record = this.freshRecord(scenarioId, action.questionId, eventTime, record.profiles, true);
      record = { ...record, version: expectedVersion, createdAt: this.requireScenario(scenarioId).createdAt, updatedAt: eventTime.toISOString() };
      return this.toView(this.persist(record, expectedVersion), viewerId);
    }
    if (action.type === "saveProfile") {
      this.requireReconfigurable(record.room);
      if (!action.profile || !Array.isArray(action.profile.tags) || !Array.isArray(action.profile.availability) || !Array.isArray(action.profile.blockedUserIds)) {
        throw new ScenarioError("INVALID_INPUT", "Profile payload is incomplete.", 400);
      }
      if (action.profile.id !== viewerId) throw new ScenarioError("SCENARIO_FORBIDDEN", "A session may update only its own profile.", 403);
      const gate = validateProfileGate(action.profile);
      if (!gate.ok) throw new ScenarioError("INVALID_INPUT", `Profile gate failed: ${gate.errors.join(", ")}`, 400);
      const profiles = record.profiles.map((profile) => profile.id === viewerId ? action.profile : profile);
      record = this.freshRecord(scenarioId, record.selectedQuestionId, eventTime, profiles, record.questionConfirmed);
      record = { ...record, version: expectedVersion, createdAt: this.requireScenario(scenarioId).createdAt, updatedAt: eventTime.toISOString() };
      return this.toView(this.persist(record, expectedVersion), viewerId);
    }
    if (!record.questionConfirmed) throw new ScenarioError("INVALID_INPUT", "请先设定标签并选择匹配问题，再进入邀请流程。", 409);

    if (action.type === "advanceTime") {
      this.requireController(viewerId);
      if (!Number.isFinite(action.hours) || action.hours <= 0 || action.hours > 168) throw new ScenarioError("INVALID_INPUT", "Time advance must be between 0 and 168 hours.", 400);
      record = { ...record, virtualNow: new Date(eventTime.getTime() + action.hours * 3_600_000).toISOString() };
      record = this.expireAtVirtualTime(record);
      return this.toView(this.persist({ ...record, updatedAt: record.virtualNow }, expectedVersion), viewerId);
    }

    if (action.type === "refreshNextRooms") {
      this.requireCompletedRoom(record.room);
      this.requireActiveMember(record.room, viewerId);
      const wallNow = this.now();
      const current = record.nextRoomRefreshByUser?.[viewerId];
      if (current && wallNow.getTime() < Date.parse(current.cooldownUntil)) {
        const seconds = Math.max(1, Math.ceil((Date.parse(current.cooldownUntil) - wallNow.getTime()) / 1_000));
        throw new ScenarioError("RATE_LIMITED", `请等待 ${seconds} 秒后再刷新推荐。`, 429);
      }
      const nextState = {
        generation: (current?.generation ?? 0) + 1,
        refreshedAt: wallNow.toISOString(),
        cooldownUntil: new Date(wallNow.getTime() + 5 * 60_000).toISOString(),
      };
      record = { ...record, nextRoomRefreshByUser: { ...record.nextRoomRefreshByUser, [viewerId]:nextState }, updatedAt:eventTime.toISOString() };
      return this.toView(this.persist(record, expectedVersion), viewerId);
    }

    if (action.type === "submitPeerRating") {
      this.requireCompletedRoom(record.room);
      this.requireActiveMember(record.room, viewerId);
      this.requireOtherActiveMember(record.room, viewerId, action.targetUserId);
      if (!Number.isInteger(action.suitability) || action.suitability < 1 || action.suitability > 5 || !Number.isInteger(action.inspiration) || action.inspiration < 1 || action.inspiration > 5) {
        throw new ScenarioError("INVALID_INPUT", "适聊度与启发度都必须是 1 到 5 的整数。", 400);
      }
      if (action.comment && action.comment.trim().length > 500) throw new ScenarioError("INVALID_INPUT", "评价最多 500 字。", 400);
      if (record.peerRatings.some((rating) => rating.raterId === viewerId && rating.targetUserId === action.targetUserId)) {
        throw new ScenarioError("TRANSITION_CONFLICT", "每轮讨论只能评价同一位成员一次。", 409);
      }
      const rating = {
        id: `rating-${viewerId}-${action.targetUserId}`,
        raterId: viewerId,
        targetUserId: action.targetUserId,
        suitability: action.suitability,
        inspiration: action.inspiration,
        ...(action.comment?.trim() ? { comment: action.comment.trim() } : {}),
        submittedAt: eventTime.toISOString(),
      };
      const profiles = record.profiles.map((profile) => {
        if (profile.id !== action.targetUserId) return profile;
        const prior = profile.conversationReputation ?? { count: 0, suitability: 0, inspiration: 0 };
        const count = prior.count + 1;
        return { ...profile, conversationReputation: {
          count,
          suitability: (prior.suitability * prior.count + action.suitability) / count,
          inspiration: (prior.inspiration * prior.count + action.inspiration) / count,
        } };
      });
      record = { ...record, profiles, peerRatings: [...record.peerRatings, rating], updatedAt: eventTime.toISOString() };
      return this.toView(this.persist(record, expectedVersion), viewerId);
    }

    if (action.type === "requestConnection") {
      this.requireCompletedRoom(record.room);
      this.requireActiveMember(record.room, viewerId);
      this.requireOtherActiveMember(record.room, viewerId, action.targetUserId);
      if (record.connectionRequests.some((request) =>
        (request.requesterId === viewerId && request.targetUserId === action.targetUserId) ||
        (request.requesterId === action.targetUserId && request.targetUserId === viewerId))) {
        throw new ScenarioError("TRANSITION_CONFLICT", "双方已有知乎号交换请求。", 409);
      }
      record = { ...record, connectionRequests: [...record.connectionRequests, {
        id: `connection-${viewerId}-${action.targetUserId}`,
        requesterId: viewerId,
        targetUserId: action.targetUserId,
        status: "pending",
        requestedAt: eventTime.toISOString(),
      }], updatedAt: eventTime.toISOString() };
      return this.toView(this.persist(record, expectedVersion), viewerId);
    }

    if (action.type === "respondConnection") {
      this.requireCompletedRoom(record.room);
      this.requireActiveMember(record.room, viewerId);
      this.requireOtherActiveMember(record.room, viewerId, action.requesterUserId);
      const pending = record.connectionRequests.find((request) =>
        request.requesterId === action.requesterUserId && request.targetUserId === viewerId && request.status === "pending");
      if (!pending) throw new ScenarioError("TRANSITION_CONFLICT", "没有待处理的知乎号交换请求。", 409);
      record = { ...record, connectionRequests: record.connectionRequests.map((request) => request.id === pending.id
        ? { ...request, status: action.accept ? "accepted" as const : "declined" as const, respondedAt: eventTime.toISOString() }
        : request), updatedAt: eventTime.toISOString() };
      return this.toView(this.persist(record, expectedVersion), viewerId);
    }

    let room = record.room;
    let match = record.match;
    if (action.type === "accept" || action.type === "decline") {
      this.requireInvitedMember(room, viewerId);
      if (action.type === "accept") {
        room = this.roomResult(transitionRoom(room, { type: "accept", userId: viewerId, expectedRevision: room.revision }, eventTime));
        record = this.withInviteStatus(record, viewerId, "accepted");
      } else {
        const changed = this.declineAndReplace(record, viewerId, action.reason, eventTime);
        ({ room, match } = changed);
        record = { ...record, invitationStatus: changed.invitationStatus };
      }
    } else if (action.type === "start") {
      this.requireAcceptedMember(room, viewerId);
      room = this.roomResult(transitionRoom(room, { type: "start", expectedRevision: room.revision }, eventTime));
      record = { ...record, invitationStatus: {
        ...record.invitationStatus,
        ...Object.fromEntries(room.members
          .filter((member) => member.status === "active" || member.status === "timed_out")
          .map((member) => [member.userId, member.status === "active" ? "active" as const : "timed_out" as const])),
      } };
    } else if (action.type === "submitPosition") {
      this.requireActiveMember(room, viewerId);
      const opening = "content" in action ? parseOpeningMessage(action.content) : action;
      const images = normalizeChatImages(action.images, `position-${viewerId}`);
      room = this.roomResult(transitionRoom(room, { type: "submitPosition", expectedRevision: room.revision, card: {
        id: `position-${viewerId}`, authorId: viewerId, judgment: opening.judgment, reasons: opening.reasons, evidence: opening.evidence, uncertainties: opening.uncertainties,
        ...(images.length ? { images } : {}),
      } }, eventTime));
      if (allActiveMembersSubmittedPositions(room)) {
        room = this.roomResult(transitionRoom(room, { type: "advanceToCrossResponse", expectedRevision: room.revision }, eventTime));
      }
    } else if (action.type === "advancePhase") {
      this.requireController(viewerId);
      if (room.state === "CROSS_RESPONSE" && room.expiresAt && eventTime < new Date(room.expiresAt)) {
        throw new ScenarioError("TRANSITION_CONFLICT", "12 小时讨论窗口结束后才能进入会后复盘。", 409);
      }
      const command = room.state === "INDEPENDENT"
        ? { type: "advanceToCrossResponse" as const, expectedRevision: room.revision }
        : { type: "advanceToSynthesis" as const, expectedRevision: room.revision };
      room = this.roomResult(transitionRoom(room, command, eventTime));
      if (room.state === "SYNTHESIS") ({ room, record } = this.completeSynthesis(record, room, eventTime));
    } else if (action.type === "submitResponse") {
      this.requireActiveMember(room, viewerId);
      const targetMessageId = "targetMessageId" in action ? action.targetMessageId : action.targetPositionId;
      const responseId = `response-${viewerId}-${room.revision + 1}`;
      const images = normalizeChatImages(action.images, responseId);
      room = this.roomResult(transitionRoom(room, { type: "submitCrossResponse", expectedRevision: room.revision, response: {
        id: responseId, authorId: viewerId, targetMessageId, relation: action.relation, content: action.content,
        ...(images.length ? { images } : {}),
      } }, eventTime));
      if (allActiveMembersSubmittedResponses(room) && room.expiresAt && eventTime >= new Date(room.expiresAt)) {
        room = this.roomResult(transitionRoom(room, { type: "advanceToSynthesis", expectedRevision: room.revision }, eventTime));
        ({ room, record } = this.completeSynthesis(record, room, eventTime));
      }
    } else if (action.type === "finish") {
      this.requireController(viewerId);
      if (room.expiresAt && eventTime < new Date(room.expiresAt)) {
        throw new ScenarioError("TRANSITION_CONFLICT", "12 小时讨论窗口结束后才能生成会后复盘。", 409);
      }
      room = this.roomResult(transitionRoom(room, { type: "finish", expectedRevision: room.revision, summary: synthesizeDiscussion(room, record.discussionSpec.question) }, eventTime));
      record = { ...record, perspectiveMap: buildPerspectiveMap(room, record.discussionSpec) };
    } else if (action.type === "exit") {
      this.requireActiveMember(room, viewerId);
      room = this.roomResult(transitionRoom(room, { type: "exit", userId: viewerId, expectedRevision: room.revision }, eventTime));
      record = this.withInviteStatus(record, viewerId, "exited");
    } else {
      throw new ScenarioError("INVALID_ACTION", "Unsupported scenario action.", 400);
    }
    record = { ...record, room, match, updatedAt: eventTime.toISOString() };
    return this.toView(this.persist(record, expectedVersion), viewerId);
  }

  private freshRecord(id: string, questionId: string, now: Date, profiles: readonly UserProfile[], questionConfirmed: boolean): ScenarioRecord {
    const discussionSpec = getDiscussionSpec(questionId);
    const initialProfiles = INITIAL_DEMO_USER_IDS.map((userId) => profiles.find((profile) => profile.id === userId)).filter((profile): profile is UserProfile => Boolean(profile));
    const matched = matchDiscussion(initialProfiles.length === INITIAL_DEMO_USER_IDS.length ? initialProfiles : initialDemoProfiles, discussionSpec, now, `${id}:${questionId}`);
    if (matched.kind !== "matched") throw new ScenarioError("INVALID_INPUT", matched.message, 400);
    const room = createRoom({
      id: `${id}-room`, invitedUserIds: matched.members.map((member) => member.userId),
      perspectiveKinds: Object.fromEntries(matched.members.map((member) => [member.userId, member.coveredSlotIds])),
      now, inviteExpiresHours: discussionSpec.inviteExpiresHours, durationHours: discussionSpec.durationHours,
    });
    return {
      id, version: 0, virtualNow: now.toISOString(), clockAnchoredAt:this.now().toISOString(), selectedQuestionId: discussionSpec.questionId, questionConfirmed,
      discussionSpec, profiles, initialUserIds: [...INITIAL_DEMO_USER_IDS], replacementUserId: REPLACEMENT_DEMO_USER_ID,
      invitationStatus: Object.fromEntries(profiles.map((profile) => [
        profile.id,
        INITIAL_DEMO_USER_IDS.includes(profile.id as (typeof INITIAL_DEMO_USER_IDS)[number]) ? "invited" : "reserve",
      ])) as Record<string, ScenarioInviteStatus>,
      match: matched, room, peerRatings: [], connectionRequests: [], nextRoomRefreshByUser: {}, createdAt: now.toISOString(), updatedAt: now.toISOString(),
    };
  }

  private declineAndReplace(record: ScenarioRecord, userId: string, reason: "skipped" | "rejected" | "blocked" | "timed_out", now: Date): { room: Room; match: MatchSuccess; invitationStatus: Readonly<Record<string, ScenarioInviteStatus>> } {
    let room = record.room;
    this.requireInvitedMember(room, userId);
    room = this.roomResult(transitionRoom(room, { type: "decline", userId, reason, expectedRevision: room.revision }, now));
    let match = record.match;
    let invitationStatus: Readonly<Record<string, ScenarioInviteStatus>> = { ...record.invitationStatus, [userId]: reason };
    if (!room.members.some((member) => member.userId === record.replacementUserId)) {
      const replacement = replaceMatchMember(record.match, userId, record.profiles, record.discussionSpec, now, `${record.id}:${record.selectedQuestionId}:replacement`);
      if (replacement.kind === "matched") {
        const replacementMember = replacement.members.find((member) => member.userId === record.replacementUserId);
        if (replacementMember) {
          room = this.roomResult(transitionRoom(room, {
            type: "replaceInvite", departedUserId: userId, replacementUserId: replacementMember.userId,
            perspectiveKinds: replacementMember.coveredSlotIds,
            inviteDeadline: new Date(now.getTime() + record.discussionSpec.inviteExpiresHours * 3_600_000).toISOString(),
            expectedRevision: room.revision,
          }, now));
          match = replacement;
          invitationStatus = { ...invitationStatus, [replacementMember.userId]: "invited" };
        }
      }
    }
    return { room, match, invitationStatus };
  }

  private effectiveNow(record: ScenarioRecord): Date {
    const virtual = Date.parse(record.virtualNow);
    const anchored = Date.parse(record.clockAnchoredAt ?? record.updatedAt);
    const elapsed = Math.max(0, this.now().getTime() - anchored);
    return new Date(virtual + elapsed);
  }

  private nextRoomRecommendations(record: ScenarioRecord, viewerId: string): readonly NextRoomRecommendation[] {
    if (record.room.state !== "ENDED" || record.room.terminalReason !== "COMPLETED") return [];
    const profile = record.profiles.find((item) => item.id === viewerId);
    if (!profile) return [];
    const generation = record.nextRoomRefreshByUser?.[viewerId]?.generation ?? 0;
    const ranked = recommendQuestionsForProfile(profile, discussionSpecs)
      .filter((item) => item.questionId !== record.selectedQuestionId)
      .flatMap((recommendation) => {
        const spec = getDiscussionSpec(recommendation.questionId);
        const result = matchDiscussion(record.profiles, spec, new Date(record.virtualNow), `${record.id}:next:${viewerId}:${generation}:${spec.questionId}`);
        if (result.kind !== "matched" || !result.members.some((member) => member.userId === viewerId)) return [];
        const perspectiveLabels = spec.slots.filter((slot) => result.coveredSlotIds.includes(slot.id)).map((slot) => slot.label);
        return [{
          id: `next-${generation}-${spec.questionId}`,
          questionId: spec.questionId,
          question: spec.question,
          memberCount: result.members.length,
          perspectiveLabels,
          reason: recommendation.matchedTagIds.length
            ? `命中 ${recommendation.matchedTagIds.length} 个已确认标签，并补入 ${perspectiveLabels.slice(0, 2).join("、")}视角`
            : `在合格候选中随机组成 ${result.members.length} 人互补圆桌`,
        } satisfies NextRoomRecommendation];
      });
    if (ranked.length < 2) return ranked;
    const offset = (stableHash(`${record.id}:${viewerId}:initial`) + generation) % ranked.length;
    return [...ranked.slice(offset), ...ranked.slice(0, offset)];
  }

  private expireAtVirtualTime(record: ScenarioRecord): ScenarioRecord {
    const now = new Date(record.virtualNow);
    let room = record.room;
    let match = record.match;
    if ((room.state === "WAITING_ACCEPTANCE" || room.state === "OPEN") && now >= new Date(room.inviteDeadline)) {
      for (const member of [...room.members]) {
        if (member.status !== "invited") continue;
        try {
          const changed = this.declineAndReplace({ ...record, room, match }, member.userId, "timed_out", now);
          ({ room, match } = changed);
          record = { ...record, invitationStatus: changed.invitationStatus };
        }
        catch (error) { if (!(error instanceof ScenarioError)) throw error; }
      }
      if ((room.state === "WAITING_ACCEPTANCE" || room.state === "OPEN") && !room.members.some((member) => member.status === "invited")) {
        const expired = transitionRoom(room, { type: "expireInvites", expectedRevision: room.revision }, now);
        if (expired.ok) room = expired.room;
      }
    } else if (room.expiresAt && now >= new Date(room.expiresAt) && !["ENDED", "CANCELLED"].includes(room.state)) {
      if (room.state === "SYNTHESIS") {
        ({ room, record } = this.completeSynthesis(record, room, now));
      } else {
        const expiration = transitionRoom(room, { type: "expireRoom", expectedRevision: room.revision }, now);
        if (expiration.ok) {
          room = expiration.room;
          if (room.state === "SYNTHESIS") ({ room, record } = this.completeSynthesis(record, room, now));
        }
      }
    }
    return { ...record, room, match };
  }

  private materializeElapsedTime(initial: ScenarioRecord): ScenarioRecord {
    let record = initial;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const eventTime = this.effectiveNow(record);
      const materialized = this.expireAtVirtualTime({ ...record, virtualNow:eventTime.toISOString() });
      if (materialized.room.revision === record.room.revision) return materialized;
      try {
        return this.persist({ ...materialized, updatedAt:eventTime.toISOString() }, record.version);
      } catch (error) {
        if (!(error instanceof ScenarioError) || error.code !== "REVISION_CONFLICT" || attempt === 1) throw error;
        record = this.requireScenario(record.id);
      }
    }
    return record;
  }

  private completeSynthesis(record: ScenarioRecord, synthesisRoom: Room, eventTime: Date): { room: Room; record: ScenarioRecord } {
    const room = this.roomResult(transitionRoom(synthesisRoom, {
      type: "finish",
      expectedRevision: synthesisRoom.revision,
      summary: synthesizeDiscussion(synthesisRoom, record.discussionSpec.question),
    }, eventTime));
    return { room, record:{ ...record, perspectiveMap:buildPerspectiveMap(room, record.discussionSpec) } };
  }

  private toView(record: ScenarioRecord, viewerId: string): ScenarioView {
    const memberStatus = record.room.members.find((member) => member.userId === viewerId)?.status;
    const viewerParticipates = memberStatus === "active" || memberStatus === "exited";
    const canReadDiscussion = viewerParticipates && record.room.state !== "INDEPENDENT";
    const positions = canReadDiscussion ? record.room.positions : record.room.positions.map((position) => position.authorId === viewerId && memberStatus === "active" ? position : ({ id: position.id, authorId: position.authorId, submitted: true as const }));
    const responses = canReadDiscussion
      ? record.room.responses
      : record.room.responses.map((response) => response.authorId === viewerId ? response : ({ id: response.id, authorId: response.authorId, submitted: true as const }));
    const safeMatch = { ...record.match, members: record.match.members.map((member) => ({
      userId: member.userId,
      role: member.role,
      contributionTagIds: member.contributionTagIds,
      coveredSlotIds: member.coveredSlotIds,
      coveredLearnTagIds: member.coveredLearnTagIds,
      explanation: member.explanation,
    })) };
    const activeUserIds = record.room.members.filter((member) => member.status === "active").map((member) => member.userId);
    const connections = activeUserIds.filter((userId) => userId !== viewerId).map((userId) => {
      const request = record.connectionRequests.find((item) =>
        (item.requesterId === viewerId && item.targetUserId === userId) ||
        (item.requesterId === userId && item.targetUserId === viewerId));
      const status = !request
        ? "none" as const
        : request.status === "accepted"
          ? "accepted" as const
          : request.status === "declined"
            ? "declined" as const
            : request.requesterId === viewerId
              ? "outgoing_pending" as const
              : "incoming_pending" as const;
      const targetProfile = record.profiles.find((profile) => profile.id === userId);
      return { userId, status, ...(status === "accepted" && targetProfile?.zhihuHandle ? { zhihuHandle: targetProfile.zhihuHandle } : {}) };
    });
    const ratingAggregates = record.profiles.map((profile) => ({
      userId: profile.id,
      count: profile.conversationReputation?.count ?? 0,
      suitability: profile.conversationReputation?.suitability ?? 0,
      inspiration: profile.conversationReputation?.inspiration ?? 0,
    }));
    const visibleSummary = record.room.summary
      ? { ...record.room.summary, headline:record.room.summary.headline ?? deriveDiscussionHeadline(record.room, record.discussionSpec.question) }
      : undefined;
    const { peerRatings: _peerRatings, connectionRequests: _connectionRequests, clockAnchoredAt: _clockAnchoredAt, nextRoomRefreshByUser: _nextRoomRefreshByUser, ...safeRecord } = record;
    void _peerRatings;
    void _connectionRequests;
    void _clockAnchoredAt;
    void _nextRoomRefreshByUser;
    const nextRoomRefresh = record.nextRoomRefreshByUser?.[viewerId];
    return {
      ...safeRecord,
      serverNow: this.now().toISOString(),
      reconfigurationAllowed: this.isReconfigurable(record.room),
      viewer: { personaId: viewerId, controller: viewerId === controllerId, ...(memberStatus ? { memberStatus } : {}) },
      profiles: record.profiles.map(({ id, displayName, source }) => ({ id, displayName, source })),
      participants: record.profiles.map((profile) => ({
        userId: profile.id,
        displayName: profile.displayName,
        inviteStatus: record.invitationStatus[profile.id] ?? "reserve",
        positionStatus: record.room.positions.some((position) => position.authorId === profile.id) ? "submitted" : "not_submitted",
        responseStatus: record.room.responses.some((response) => response.authorId === profile.id) ? "submitted" : "not_submitted",
      })),
      match: safeMatch,
      room: { ...record.room, summary:viewerParticipates ? visibleSummary : undefined, positions, responses },
      perspectiveMap: viewerParticipates ? record.perspectiveMap : undefined,
      ratingAggregates,
      myRatingTargetIds: record.peerRatings.filter((rating) => rating.raterId === viewerId).map((rating) => rating.targetUserId),
      connections,
      questionRecommendations: recommendQuestionsForProfile(record.profiles.find((profile) => profile.id === viewerId)!, discussionSpecs).slice(0, 3),
      nextRoomRecommendations: this.nextRoomRecommendations(record, viewerId),
      ...(nextRoomRefresh ? { nextRoomRefreshAvailableAt:nextRoomRefresh.cooldownUntil } : {}),
    };
  }

  private requireScenario(id: string): ScenarioRecord {
    const record = this.repository.get(id);
    if (!record) throw new ScenarioError("SCENARIO_NOT_FOUND", "Scenario was not found.", 404);
    if (record.invitationStatus) return {
      ...record,
      questionConfirmed: record.questionConfirmed === true,
      peerRatings: record.peerRatings ?? [],
      connectionRequests: record.connectionRequests ?? [],
      nextRoomRefreshByUser: record.nextRoomRefreshByUser ?? {},
    };
    const roomStatus = new Map(record.room.members.map((member) => [member.userId, member.status]));
    const invitationStatus = Object.fromEntries(record.profiles.map((profile) => {
      const status = roomStatus.get(profile.id);
      const normalized: ScenarioInviteStatus = status === "accepted" || status === "active" || status === "timed_out" || status === "blocked" || status === "exited"
        ? status
        : status === "declined"
          ? "rejected"
          : status === "invited"
            ? "invited"
            : "reserve";
      return [profile.id, normalized];
    }));
    return { ...record, questionConfirmed:record.questionConfirmed === true, invitationStatus, peerRatings: record.peerRatings ?? [], connectionRequests: record.connectionRequests ?? [], nextRoomRefreshByUser: record.nextRoomRefreshByUser ?? {} };
  }
  private requireKnownViewer(record: ScenarioRecord, viewerId: string): void {
    if (!record.profiles.some((profile) => profile.id === viewerId)) throw new ScenarioError("NOT_MEMBER", "This identity does not belong to the scenario.", 403);
  }
  private requireController(viewerId: string): void {
    if (viewerId !== controllerId) throw new ScenarioError("CONTROLLER_REQUIRED", "此操作仅限 Demo/Test 演示导演身份。", 403);
  }
  private requireInvitedMember(room: Room, userId: string): void {
    if (!room.members.some((member) => member.userId === userId)) throw new ScenarioError("NOT_MEMBER", "This identity is not invited to the room.", 403);
  }
  private requireReconfigurable(room: Room): void {
    if (!this.isReconfigurable(room)) {
      throw new ScenarioError(
        "TRANSITION_CONFLICT",
        "本轮已有成员响应或邀请已超时，不能再修改标签或更换问题。切换身份不会重置共享场景；如需从头开始，请由林澈在演示导演台重置场景。",
        409,
      );
    }
  }
  private isReconfigurable(room: Room): boolean {
    const untouched = room.state === "WAITING_ACCEPTANCE" && room.revision === 0 && room.positions.length === 0 && room.responses.length === 0;
    return untouched || room.state === "ENDED" || room.state === "CANCELLED";
  }
  private withInviteStatus(record: ScenarioRecord, userId: string, status: ScenarioInviteStatus): ScenarioRecord {
    return { ...record, invitationStatus: { ...record.invitationStatus, [userId]: status } };
  }
  private requireAcceptedMember(room: Room, userId: string): void {
    if (!room.members.some((member) => member.userId === userId && member.status === "accepted")) throw new ScenarioError("NOT_MEMBER", "An accepted room member is required.", 403);
  }
  private requireActiveMember(room: Room, userId: string): void {
    if (!room.members.some((member) => member.userId === userId && member.status === "active")) throw new ScenarioError("NOT_MEMBER", "An active room member is required.", 403);
  }
  private requireOtherActiveMember(room: Room, viewerId: string, targetUserId: string): void {
    if (targetUserId === viewerId) throw new ScenarioError("INVALID_INPUT", "不能对自己执行此操作。", 400);
    if (!room.members.some((member) => member.userId === targetUserId && member.status === "active")) {
      throw new ScenarioError("NOT_MEMBER", "目标用户不是本轮讨论的活跃成员。", 403);
    }
  }
  private requireCompletedRoom(room: Room): void {
    if (room.state !== "ENDED" || room.terminalReason !== "COMPLETED") {
      throw new ScenarioError("TRANSITION_CONFLICT", "完成讨论后才能评价或申请交换知乎号。", 409);
    }
  }
  private roomResult(result: ReturnType<typeof transitionRoom>): Room {
    if (result.ok) return result.room;
    const status = result.code === "REVISION_CONFLICT" ? 409 : result.code === "MEMBER_NOT_FOUND" || result.code === "MEMBER_NOT_ACTIVE" ? 403 : 409;
    throw new ScenarioError(result.code === "REVISION_CONFLICT" ? "REVISION_CONFLICT" : "TRANSITION_CONFLICT", result.message, status);
  }
  private persist(record: ScenarioRecord, expectedVersion: number): ScenarioRecord {
    try { return this.repository.save({ ...record, clockAnchoredAt:this.now().toISOString() }, expectedVersion); }
    catch (error) { if (error instanceof ScenarioConflictError) throw new ScenarioError("REVISION_CONFLICT", error.message, 409); throw error; }
  }
}
