import type { ISODateTime, UserId } from "./models";

export type RoomState =
  | "WAITING_ACCEPTANCE"
  | "OPEN"
  | "INDEPENDENT"
  | "CROSS_RESPONSE"
  | "SYNTHESIS"
  | "ENDED"
  | "CANCELLED";

export type RoomMemberStatus =
  | "invited"
  | "accepted"
  | "active"
  | "declined"
  | "timed_out"
  | "exited"
  | "blocked";

export const CHAT_IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export const MAX_CHAT_IMAGES_PER_MESSAGE = 3;
export const MAX_CHAT_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_CHAT_IMAGE_TOTAL_BYTES = 6 * 1024 * 1024;

export type ChatImageMimeType = (typeof CHAT_IMAGE_MIME_TYPES)[number];

export interface ChatImageInput {
  name?: string;
  dataUrl: string;
}

export interface ChatImageAttachment {
  id: string;
  name: string;
  mimeType: ChatImageMimeType;
  byteSize: number;
  dataUrl: string;
}

export interface PositionCard {
  id: string;
  authorId: UserId;
  judgment: string;
  reasons: readonly string[];
  evidence: readonly string[];
  uncertainties: readonly string[];
  images?: readonly ChatImageAttachment[];
  submittedAt: ISODateTime;
}

export interface CrossResponse {
  id: string;
  authorId: UserId;
  targetMessageId?: string;
  /** Legacy direct-position reference kept so persisted Demo records remain readable. */
  targetPositionId?: string;
  relation: "different" | "complementary";
  content: string;
  images?: readonly ChatImageAttachment[];
  submittedAt: ISODateTime;
}

export function getResponseTargetMessageId(response: Pick<CrossResponse, "targetMessageId" | "targetPositionId">): string | undefined {
  return response.targetMessageId ?? response.targetPositionId;
}

export interface DiscussionSummary {
  /** Short, content-derived label for the recap hero. Optional for legacy persisted rounds. */
  headline?: string;
  consensus: readonly string[];
  disagreements: readonly string[];
  evidenceGaps: readonly string[];
  unresolvedQuestions: readonly string[];
  generatedAt: ISODateTime;
}

export interface Room {
  id: string;
  state: RoomState;
  revision: number;
  inviteDeadline: ISODateTime;
  expiresAt?: ISODateTime;
  durationHours: number;
  openedAt?: ISODateTime;
  startedAt?: ISODateTime;
  endedAt?: ISODateTime;
  members: readonly { userId: UserId; status: RoomMemberStatus }[];
  perspectiveKinds: Readonly<Record<UserId, readonly string[]>>;
  positions: readonly PositionCard[];
  responses: readonly CrossResponse[];
  summary?: DiscussionSummary;
  terminalReason?: "INSUFFICIENT_ACCEPTANCES" | "NO_CONTENT" | "INSUFFICIENT_PARTICIPATION" | "COMPLETED";
}

export type RoomCommand =
  | { type: "accept"; userId: UserId; expectedRevision: number }
  | { type: "decline"; userId: UserId; reason: "skipped" | "rejected" | "blocked" | "timed_out"; expectedRevision: number }
  | { type: "replaceInvite"; departedUserId: UserId; replacementUserId: UserId; perspectiveKinds: readonly string[]; inviteDeadline?: ISODateTime; expectedRevision: number }
  | { type: "start"; expectedRevision: number }
  | { type: "submitPosition"; card: Omit<PositionCard, "submittedAt">; expectedRevision: number }
  | { type: "advanceToCrossResponse"; expectedRevision: number }
  | { type: "submitCrossResponse"; response: Omit<CrossResponse, "submittedAt">; expectedRevision: number }
  | { type: "advanceToSynthesis"; expectedRevision: number }
  | { type: "finish"; summary: Omit<DiscussionSummary, "generatedAt">; expectedRevision: number }
  | { type: "exit"; userId: UserId; expectedRevision: number }
  | { type: "expireInvites"; expectedRevision: number }
  | { type: "expireRoom"; expectedRevision: number };

export type RoomErrorCode =
  | "REVISION_CONFLICT"
  | "INVALID_TRANSITION"
  | "MEMBER_NOT_FOUND"
  | "MEMBER_NOT_ACTIVE"
  | "ALREADY_RESPONDED"
  | "INVALID_SUBMISSION"
  | "INSUFFICIENT_ACCEPTANCES"
  | "INSUFFICIENT_DIVERSITY"
  | "DEADLINE_NOT_REACHED"
  | "ROOM_FULL";

export type RoomTransitionResult =
  | { ok: true; room: Room }
  | { ok: false; code: RoomErrorCode; message: string; room: Room };

export function createRoom(input: {
  id: string;
  invitedUserIds: readonly UserId[];
  perspectiveKinds: Readonly<Record<UserId, readonly string[]>>;
  now: Date;
  inviteExpiresHours?: number;
  durationHours?: number;
}): Room {
  const invited = [...new Set(input.invitedUserIds)];
  if (invited.length < 3 || invited.length > 5) {
    throw new Error("A room must initially invite 3 to 5 unique members.");
  }
  const inviteExpiresHours = input.inviteExpiresHours ?? 12;
  const durationHours = input.durationHours ?? 12;
  if (!Number.isFinite(inviteExpiresHours) || inviteExpiresHours <= 0 || !Number.isFinite(durationHours) || durationHours <= 0) {
    throw new Error("Room invitation and discussion durations must be positive.");
  }
  return {
    id: input.id,
    state: "WAITING_ACCEPTANCE",
    revision: 0,
    inviteDeadline: new Date(input.now.getTime() + inviteExpiresHours * 3_600_000).toISOString(),
    durationHours,
    members: invited.map((userId) => ({ userId, status: "invited" })),
    perspectiveKinds: input.perspectiveKinds,
    positions: [],
    responses: [],
  };
}

const fail = (room: Room, code: RoomErrorCode, message: string): RoomTransitionResult => ({ ok: false, code, message, room });
const acceptedCount = (room: Room) => room.members.filter((member) => member.status === "accepted" || member.status === "active").length;
export const activeRoomMemberIds = (room: Room) => room.members.filter((member) => member.status === "active").map((member) => member.userId);
export const allActiveMembersSubmittedPositions = (room: Room) =>
  activeRoomMemberIds(room).every((userId) => room.positions.some((item) => item.authorId === userId));
export const allActiveMembersSubmittedResponses = (room: Room) =>
  activeRoomMemberIds(room).every((userId) => room.responses.some((item) => item.authorId === userId));
const updateMember = (room: Room, userId: string, status: RoomMemberStatus) =>
  room.members.map((member) => (member.userId === userId ? { ...member, status } : member));
const validImages = (images: readonly ChatImageAttachment[] | undefined) => {
  const values = images ?? [];
  return values.length <= MAX_CHAT_IMAGES_PER_MESSAGE &&
    values.reduce((sum, image) => sum + image.byteSize, 0) <= MAX_CHAT_IMAGE_TOTAL_BYTES &&
    values.every((image) => CHAT_IMAGE_MIME_TYPES.includes(image.mimeType) && image.byteSize > 0 && image.byteSize <= MAX_CHAT_IMAGE_BYTES && image.dataUrl.startsWith(`data:${image.mimeType};base64,`));
};
const success = (room: Room, patch: Partial<Room>): RoomTransitionResult => ({
  ok: true,
  room: { ...room, ...patch, revision: room.revision + 1 },
});

function ensurePhase(room: Room, expected: RoomState): RoomTransitionResult | null {
  return room.state === expected ? null : fail(room, "INVALID_TRANSITION", `当前状态 ${room.state} 不能执行此操作。`);
}

export function transitionRoom(room: Room, command: RoomCommand, now: Date): RoomTransitionResult {
  if (command.expectedRevision !== room.revision) return fail(room, "REVISION_CONFLICT", "房间已更新，请刷新后重试。");
  if (room.state === "ENDED" || room.state === "CANCELLED") return fail(room, "INVALID_TRANSITION", "房间已经结束。");

  if (command.type === "accept") {
    if (room.state !== "WAITING_ACCEPTANCE" && room.state !== "OPEN") return fail(room, "INVALID_TRANSITION", "讨论开始后不能接受邀请。");
    const member = room.members.find((item) => item.userId === command.userId);
    if (!member) return fail(room, "MEMBER_NOT_FOUND", "成员不在邀请名单中。");
    if (member.status === "accepted") return { ok: true, room };
    if (member.status !== "invited") return fail(room, "INVALID_TRANSITION", "该邀请已处理。");
    const members = updateMember(room, command.userId, "accepted");
    const willOpen = members.filter((item) => item.status === "accepted").length >= 3;
    return success(room, { members, state: willOpen ? "OPEN" : room.state, openedAt: willOpen ? room.openedAt ?? now.toISOString() : room.openedAt });
  }

  if (command.type === "decline") {
    if (room.state !== "WAITING_ACCEPTANCE" && room.state !== "OPEN") return fail(room, "INVALID_TRANSITION", "讨论开始后请使用退出操作。");
    const member = room.members.find((item) => item.userId === command.userId);
    if (!member) return fail(room, "MEMBER_NOT_FOUND", "成员不在邀请名单中。");
    const status: RoomMemberStatus = command.reason === "blocked" ? "blocked" : command.reason === "timed_out" ? "timed_out" : "declined";
    const members = updateMember(room, command.userId, status);
    const count = members.filter((item) => item.status === "accepted").length;
    return success(room, { members, state: count >= 3 ? "OPEN" : "WAITING_ACCEPTANCE" });
  }

  if (command.type === "replaceInvite") {
    if (room.state !== "WAITING_ACCEPTANCE" && room.state !== "OPEN") return fail(room, "INVALID_TRANSITION", "独立观点阶段开始后不再插入陌生成员。");
    if (room.members.some((item) => item.userId === command.replacementUserId)) return fail(room, "INVALID_SUBMISSION", "递补成员已在房间中。");
    const index = room.members.findIndex((item) => item.userId === command.departedUserId && ["declined", "timed_out", "blocked", "exited"].includes(item.status));
    if (index < 0) return fail(room, "MEMBER_NOT_FOUND", "没有可递补的空位。");
    const members = [...room.members];
    members[index] = { userId: command.replacementUserId, status: "invited" };
    return success(room, {
      members,
      inviteDeadline: command.inviteDeadline ?? room.inviteDeadline,
      perspectiveKinds: { ...room.perspectiveKinds, [command.replacementUserId]: command.perspectiveKinds },
    });
  }

  if (command.type === "start") {
    const invalid = ensurePhase(room, "OPEN");
    if (invalid) return invalid;
    const accepted = room.members.filter((member) => member.status === "accepted");
    if (accepted.length < 3) return fail(room, "INSUFFICIENT_ACCEPTANCES", "至少三人接受后才能开始。");
    if (room.members.some((member) => member.status === "invited")) return fail(room, "INVALID_TRANSITION", "仍有成员尚未响应；请等待接受、明确拒绝或邀请超时后再开始。");
    const kinds = new Set(accepted.flatMap((member) => room.perspectiveKinds[member.userId] ?? []));
    if (kinds.size < 3) return fail(room, "INSUFFICIENT_DIVERSITY", "至少需要三类贡献视角。");
    return success(room, {
      state: "INDEPENDENT",
      startedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + room.durationHours * 3_600_000).toISOString(),
      members: room.members.map((member) => member.status === "accepted"
        ? { ...member, status: "active" }
        : member.status === "invited"
          ? { ...member, status: "timed_out" }
          : member),
    });
  }

  if (command.type === "submitPosition") {
    const invalid = ensurePhase(room, "INDEPENDENT");
    if (invalid) return invalid;
    if (!activeRoomMemberIds(room).includes(command.card.authorId)) return fail(room, "MEMBER_NOT_ACTIVE", "只有活跃成员可以提交独立观点。");
    if (room.positions.some((item) => item.authorId === command.card.authorId)) return fail(room, "ALREADY_RESPONDED", "每位成员只能提交一张独立立场卡。");
    if (!validImages(command.card.images)) return fail(room, "INVALID_SUBMISSION", "图片附件不符合数量、大小或格式限制。");
    if (!command.card.judgment.trim() && !(command.card.images?.length)) return fail(room, "INVALID_SUBMISSION", "首条独立发言需要文字或图片。");
    return success(room, { positions: [...room.positions, { ...command.card, submittedAt: now.toISOString() }] });
  }

  if (command.type === "advanceToCrossResponse") {
    const invalid = ensurePhase(room, "INDEPENDENT");
    if (invalid) return invalid;
    if (!allActiveMembersSubmittedPositions(room)) return fail(room, "INVALID_SUBMISSION", "所有活跃成员提交独立立场卡后才能进入交叉回应。");
    return success(room, { state: "CROSS_RESPONSE" });
  }

  if (command.type === "submitCrossResponse") {
    const invalid = ensurePhase(room, "CROSS_RESPONSE");
    if (invalid) return invalid;
    if (!activeRoomMemberIds(room).includes(command.response.authorId)) return fail(room, "MEMBER_NOT_ACTIVE", "只有活跃成员可以回应。");
    const targetMessageId = getResponseTargetMessageId(command.response);
    const target = room.positions.find((item) => item.id === targetMessageId) ?? room.responses.find((item) => item.id === targetMessageId);
    if (!validImages(command.response.images)) return fail(room, "INVALID_SUBMISSION", "图片附件不符合数量、大小或格式限制。");
    if (!target || target.authorId === command.response.authorId || (!command.response.content.trim() && !(command.response.images?.length))) return fail(room, "INVALID_SUBMISSION", "回应必须指向另一位成员的有效消息，并包含文字或图片。");
    if (room.responses.some((item) => item.authorId === command.response.authorId && getResponseTargetMessageId(item) === targetMessageId)) {
      return fail(room, "ALREADY_RESPONDED", "你已经回复过这条消息。");
    }
    return success(room, { responses: [...room.responses, {
      id: command.response.id,
      authorId: command.response.authorId,
      targetMessageId,
      relation: command.response.relation,
      content: command.response.content,
      ...(command.response.images?.length ? { images:command.response.images } : {}),
      submittedAt: now.toISOString(),
    }] });
  }

  if (command.type === "advanceToSynthesis") {
    const invalid = ensurePhase(room, "CROSS_RESPONSE");
    if (invalid) return invalid;
    if (!allActiveMembersSubmittedResponses(room)) return fail(room, "INVALID_SUBMISSION", "所有活跃成员完成交叉回应后才能进入收束总结。");
    if (!room.expiresAt || now.getTime() < new Date(room.expiresAt).getTime()) {
      return fail(room, "DEADLINE_NOT_REACHED", "12 小时讨论窗口结束后才能进入收束总结。");
    }
    return success(room, { state: "SYNTHESIS" });
  }

  if (command.type === "finish") {
    const invalid = ensurePhase(room, "SYNTHESIS");
    if (invalid) return invalid;
    if (!room.expiresAt || now.getTime() < new Date(room.expiresAt).getTime()) {
      return fail(room, "DEADLINE_NOT_REACHED", "12 小时讨论窗口结束后才能生成会后复盘。");
    }
    return success(room, {
      state: "ENDED",
      endedAt: now.toISOString(),
      terminalReason: "COMPLETED",
      summary: { ...command.summary, generatedAt: now.toISOString() },
    });
  }

  if (command.type === "exit") {
    const member = room.members.find((item) => item.userId === command.userId);
    if (!member) return fail(room, "MEMBER_NOT_FOUND", "成员不在房间中。");
    const members = updateMember(room, command.userId, "exited");
    if (room.state === "WAITING_ACCEPTANCE" || room.state === "OPEN") {
      const count = members.filter((item) => item.status === "accepted").length;
      return success(room, { members, state: count >= 3 ? "OPEN" : "WAITING_ACCEPTANCE" });
    }
    const remaining = members.filter((item) => item.status === "active").length;
    if (remaining < 2) return success(room, { members, state: "ENDED", endedAt: now.toISOString(), terminalReason: "INSUFFICIENT_PARTICIPATION" });
    return success(room, { members });
  }

  if (command.type === "expireInvites") {
    if (room.state !== "WAITING_ACCEPTANCE" && room.state !== "OPEN") return fail(room, "INVALID_TRANSITION", "邀请阶段已经结束。");
    if (now.getTime() < new Date(room.inviteDeadline).getTime()) return fail(room, "DEADLINE_NOT_REACHED", "邀请尚未到期。");
    if (acceptedCount(room) >= 3) return success(room, { state: "OPEN" });
    return success(room, { state: "CANCELLED", endedAt: now.toISOString(), terminalReason: "INSUFFICIENT_ACCEPTANCES" });
  }

  if (command.type === "expireRoom") {
    if (!room.expiresAt || now.getTime() < new Date(room.expiresAt).getTime()) return fail(room, "DEADLINE_NOT_REACHED", "房间尚未开始或尚未到期。");
    if (room.state === "INDEPENDENT") {
      if (!allActiveMembersSubmittedPositions(room)) return fail(room, "INVALID_SUBMISSION", "讨论到期也不能跳过独立立场卡；所有活跃成员提交后才能进入交叉回应。");
      return success(room, { state: "CROSS_RESPONSE" });
    }
    if (room.state === "CROSS_RESPONSE") {
      if (!allActiveMembersSubmittedResponses(room)) return fail(room, "INVALID_SUBMISSION", "讨论到期也不能跳过交叉回应；所有活跃成员回应后才能进入收束总结。");
      return success(room, { state: "SYNTHESIS" });
    }
    return fail(room, "INVALID_TRANSITION", "推进模拟时间不能跳过当前阶段的必需提交；全部条件满足后由 AI 主持自动生成复盘。");
  }

  return fail(room, "INVALID_TRANSITION", "未知操作。");
}
