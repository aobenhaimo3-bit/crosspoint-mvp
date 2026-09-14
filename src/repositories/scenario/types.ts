import type { ConnectionRequest, DiscussionSpec, MatchSuccess, PeerRating, Room, UserProfile } from "@/domain";

export interface PerspectiveMapNode {
  userId: string;
  judgment: string;
  evidence: readonly string[];
  uncertainties: readonly string[];
}

export interface PerspectiveMapEdge {
  fromUserId: string;
  toUserId: string;
  relation: "different" | "complementary";
  content: string;
}

export interface PerspectiveMapData {
  nodes: readonly PerspectiveMapNode[];
  edges: readonly PerspectiveMapEdge[];
  vacancies: readonly { slotId: string; label: string }[];
}

export type ScenarioInviteStatus =
  | "reserve" | "invited" | "accepted" | "active"
  | "rejected" | "skipped" | "blocked" | "timed_out" | "exited";

export interface NextRoomRefreshState {
  generation: number;
  refreshedAt: string;
  cooldownUntil: string;
}

export interface ScenarioRecord {
  id: string;
  version: number;
  virtualNow: string;
  clockAnchoredAt?: string;
  selectedQuestionId: string;
  questionConfirmed: boolean;
  discussionSpec: DiscussionSpec;
  profiles: readonly UserProfile[];
  initialUserIds: readonly string[];
  replacementUserId: string;
  invitationStatus: Readonly<Record<string, ScenarioInviteStatus>>;
  match: MatchSuccess;
  room: Room;
  peerRatings: readonly PeerRating[];
  connectionRequests: readonly ConnectionRequest[];
  nextRoomRefreshByUser?: Readonly<Record<string, NextRoomRefreshState>>;
  perspectiveMap?: PerspectiveMapData;
  createdAt: string;
  updatedAt: string;
}

export interface ScenarioRepository {
  get(id: string): ScenarioRecord | null;
  create(record: ScenarioRecord): ScenarioRecord;
  save(record: ScenarioRecord, expectedVersion: number): ScenarioRecord;
  delete(id: string): void;
  close?(): void;
}
