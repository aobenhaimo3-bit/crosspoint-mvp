import type { ChatImageInput, CrossResponse, MatchMember, MatchSuccess, PeerRatingAggregate, PositionCard, QuestionRecommendation, UserProfile } from "@/domain";
import type { PerspectiveMapData, ScenarioInviteStatus, ScenarioRecord } from "@/repositories/scenario";

export type ScenarioAction =
  | { type: "chooseQuestion"; questionId: string }
  | { type: "saveProfile"; profile: UserProfile }
  | { type: "accept" }
  | { type: "decline"; reason: "skipped" | "rejected" | "blocked" }
  | { type: "start" }
  | { type: "submitPosition"; content: string; images?: ChatImageInput[] }
  | { type: "submitPosition"; judgment: string; reasons: string[]; evidence: string[]; uncertainties: string[]; images?: ChatImageInput[] }
  | { type: "advancePhase" }
  | { type: "submitResponse"; targetMessageId: string; relation: "different" | "complementary"; content: string; images?: ChatImageInput[] }
  | { type: "submitResponse"; targetPositionId: string; relation: "different" | "complementary"; content: string; images?: ChatImageInput[] }
  | { type: "finish" }
  | { type: "submitPeerRating"; targetUserId: string; suitability: number; inspiration: number; comment?: string }
  | { type: "requestConnection"; targetUserId: string }
  | { type: "respondConnection"; requesterUserId: string; accept: boolean }
  | { type: "refreshNextRooms" }
  | { type: "exit" }
  | { type: "advanceTime"; hours: number }
  | { type: "reset" };

export type SafePosition = PositionCard | { id: string; authorId: string; submitted: true };
export type SafeResponse = CrossResponse | { id: string; authorId: string; submitted: true };

export type SafeMatch = Omit<MatchSuccess, "members"> & { members: readonly Omit<MatchMember, "score">[] };

export interface NextRoomRecommendation {
  id: string;
  questionId: string;
  question: string;
  memberCount: number;
  perspectiveLabels: readonly string[];
  reason: string;
}

export interface ScenarioView extends Omit<ScenarioRecord, "profiles" | "match" | "room" | "perspectiveMap" | "peerRatings" | "connectionRequests" | "clockAnchoredAt" | "nextRoomRefreshByUser"> {
  serverNow: string;
  viewer: { personaId: string; controller: boolean; memberStatus?: string };
  profiles: readonly { id: string; displayName: string; source: "crosspoint" | "demo" }[];
  participants: readonly {
    userId: string;
    displayName: string;
    inviteStatus: ScenarioInviteStatus;
    positionStatus: "not_submitted" | "submitted";
    responseStatus: "not_submitted" | "submitted";
  }[];
  match: SafeMatch;
  room: Omit<ScenarioRecord["room"], "positions" | "responses"> & {
    positions: readonly SafePosition[];
    responses: readonly SafeResponse[];
  };
  perspectiveMap?: PerspectiveMapData;
  ratingAggregates: readonly PeerRatingAggregate[];
  myRatingTargetIds: readonly string[];
  connections: readonly {
    userId: string;
    status: "none" | "outgoing_pending" | "incoming_pending" | "accepted" | "declined";
    zhihuHandle?: string;
  }[];
  questionRecommendations: readonly QuestionRecommendation[];
  nextRoomRecommendations: readonly NextRoomRecommendation[];
  nextRoomRefreshAvailableAt?: string;
}
