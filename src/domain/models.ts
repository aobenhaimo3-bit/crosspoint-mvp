export type ISODateTime = string;
export type UserId = string;
export type TagId = string;

export type TagCategory =
  | "topic"
  | "expertise"
  | "experience"
  | "role"
  | "perspective"
  | "evidence";

export type TagSource =
  | "self"
  | "zhihu_profile"
  | "discussion_behavior"
  | "ai_suggested";
export type TagVisibility = "public" | "room_only" | "matching_only";
export type TagIntent = "topic" | "contribute" | "learn" | "expected_perspective";

export interface StandardTag {
  id: TagId;
  label: string;
  category: TagCategory;
  aliases: readonly string[];
  active: boolean;
}

export interface ProfileTag {
  tagId: TagId;
  intent: TagIntent;
  source: TagSource;
  confidence: number;
  visibility: TagVisibility;
  confirmed: boolean;
  matchingAllowed: boolean;
}

export interface AvailabilityWindow {
  /** IANA timezone, for example Asia/Shanghai. */
  timezone: string;
  /** 0 is Sunday, 6 is Saturday. */
  daysOfWeek: readonly number[];
  startMinute: number;
  endMinute: number;
  maxResponseHours: number;
}

export interface UserProfile {
  id: UserId;
  displayName: string;
  source: "crosspoint" | "demo";
  registered: boolean;
  tags: readonly ProfileTag[];
  availability: readonly AvailabilityWindow[];
  matchingConsent: boolean;
  responseProbability: number;
  completionRate: number;
  /** Aggregated post-discussion signal only; individual ratings never enter matching views. */
  conversationReputation?: {
    count: number;
    suitability: number;
    inspiration: number;
  };
  /** Server-only until both participants consent to exchange contact details. */
  zhihuHandle?: string;
  blockedUserIds: readonly UserId[];
}

export type PerspectiveKind =
  | "learner"
  | "technical"
  | "employer"
  | "education"
  | "industry"
  | "research_evidence"
  | "practice_evidence";

export interface PerspectiveSlot {
  id: string;
  label: string;
  kind: PerspectiveKind;
  required: boolean;
  matchedByTagIds: readonly TagId[];
  learnableTagIds: readonly TagId[];
}

export interface DiscussionSpec {
  id: string;
  questionId: string;
  question: string;
  /** Strong signals that define the question's primary subject. */
  topicTagIds: readonly TagId[];
  /** Broader self-selected interests that can raise relevance without diluting core signals. */
  relatedTopicTagIds?: readonly TagId[];
  relevantContributionTagIds: readonly TagId[];
  minRelevance: number;
  slots: readonly PerspectiveSlot[];
  problemCanCoverLearnTagIds: readonly TagId[];
  durationHours: number;
  source?: {
    platform: "zhihu";
    title: string;
    url?: string;
    retrievedAt?: string;
  };
  inviteExpiresHours: number;
  minMembers: 3;
  maxMembers: 5;
}

export interface ScoreBreakdown {
  relevance: number;
  basis: number;
  novelty: number;
  response: number;
  completion: number;
  conversationFit: number;
  redundancyPenalty: number;
  total: number;
}

export interface MatchMember {
  userId: UserId;
  role: "anchor" | "complement";
  contributionTagIds: readonly TagId[];
  coveredSlotIds: readonly string[];
  coveredLearnTagIds: readonly TagId[];
  score: ScoreBreakdown;
  explanation: string;
}

export interface MatchSuccess {
  kind: "matched";
  algorithmVersion: "constraint-lottery-v1";
  assemblyMethod: "hard-constraints-then-seeded-lottery";
  discussionSpecId: string;
  members: readonly MatchMember[];
  coveredSlotIds: readonly string[];
  missingSlotIds: readonly string[];
  explanation: string;
  createdAt: ISODateTime;
}

export type MatchDegradationCode =
  | "INSUFFICIENT_ELIGIBLE_CANDIDATES"
  | "INSUFFICIENT_PERSPECTIVE_DIVERSITY"
  | "UNCOVERED_LEARNING_NEEDS"
  | "AVAILABILITY_MISMATCH"
  | "BLOCK_CONFLICT"
  | "NO_VALID_REPLACEMENT";

export interface MatchDegraded {
  kind: "degraded";
  code: MatchDegradationCode;
  eligibleCount: number;
  missingSlotIds: readonly string[];
  message: string;
}

export type MatchResult = MatchSuccess | MatchDegraded;
