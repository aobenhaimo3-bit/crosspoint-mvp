import type {
  DiscussionSpec,
  MatchDegraded,
  MatchMember,
  MatchResult,
  MatchSuccess,
  PerspectiveKind,
  ProfileTag,
  ScoreBreakdown,
  UserProfile,
} from "./models";
import { isAvailableNow, validateProfileGate } from "./profile";
import { STANDARD_TAG_BY_ID } from "./tags";

interface Features {
  profile: UserProfile;
  activeTags: readonly ProfileTag[];
  relevantContributions: readonly string[];
  coveredSlotIds: readonly string[];
  coveredKinds: readonly PerspectiveKind[];
  relevance: number;
  basis: number;
}

export interface QuestionRecommendation {
  questionId: string;
  question: string;
  score: number;
  matchedTagIds: readonly string[];
}

const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];
const intersect = <T>(left: readonly T[], right: readonly T[]) => left.filter((item) => right.includes(item));
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const seededHash = (value: string): number => {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

/** Ranks questions from confirmed, matching-consented tags before any room is assembled. */
export function recommendQuestionsForProfile(
  profile: UserProfile,
  specs: readonly DiscussionSpec[],
): readonly QuestionRecommendation[] {
  const activeTags = validateProfileGate(profile).activeTags;
  const topicIds = unique(activeTags.filter((tag) => tag.intent === "topic").map((tag) => tag.tagId));
  const contributionIds = unique(activeTags.filter((tag) => tag.intent === "contribute").map((tag) => tag.tagId));
  return specs.map((spec) => {
    const topicMatches = intersect(topicIds, spec.topicTagIds);
    const relatedTopicMatches = intersect(topicIds, spec.relatedTopicTagIds ?? []);
    const contributionMatches = intersect(contributionIds, spec.relevantContributionTagIds);
    const coreTopicScore = spec.topicTagIds.length === 0
      ? 0
      : topicMatches.length / Math.min(3, spec.topicTagIds.length);
    const relatedTopicScore = (spec.relatedTopicTagIds?.length ?? 0) === 0
      ? 0
      : relatedTopicMatches.length / Math.min(3, spec.relatedTopicTagIds!.length);
    const topicScore = clamp(coreTopicScore + 0.2 * relatedTopicScore);
    const contributionScore = spec.relevantContributionTagIds.length === 0
      ? 0
      : Math.min(1, contributionMatches.length / Math.min(3, spec.relevantContributionTagIds.length));
    return {
      questionId: spec.questionId,
      question: spec.question,
      score: 0.65 * topicScore + 0.35 * contributionScore,
      matchedTagIds: unique([...topicMatches, ...relatedTopicMatches, ...contributionMatches]),
    };
  }).sort((a, b) => b.score - a.score || a.questionId.localeCompare(b.questionId));
}

function makeFeatures(profile: UserProfile, spec: DiscussionSpec): Features {
  const activeTags = validateProfileGate(profile).activeTags;
  const contributeIds = unique(activeTags.filter((tag) => tag.intent === "contribute").map((tag) => tag.tagId));
  const topicIds = unique(activeTags.filter((tag) => tag.intent === "topic").map((tag) => tag.tagId));
  const relevantContributions = intersect(contributeIds, spec.relevantContributionTagIds);
  const coveredSlots = spec.slots.filter((slot) => intersect(contributeIds, slot.matchedByTagIds).length > 0);
  const contributionPart = clamp(relevantContributions.length);
  const coreTopicPart = spec.topicTagIds.length === 0
    ? 0
    : intersect(topicIds, spec.topicTagIds).length / Math.min(3, spec.topicTagIds.length);
  const relatedTopicPart = (spec.relatedTopicTagIds?.length ?? 0) === 0
    ? 0
    : intersect(topicIds, spec.relatedTopicTagIds!).length / Math.min(3, spec.relatedTopicTagIds!.length);
  const topicPart = clamp(coreTopicPart + 0.2 * relatedTopicPart);
  const relevantBasisIds = unique([...spec.relevantContributionTagIds, ...spec.slots.flatMap((slot) => slot.matchedByTagIds)]);
  const basisTags = activeTags.filter((tag) => {
    const category = STANDARD_TAG_BY_ID.get(tag.tagId)?.category;
    return (
      tag.intent === "contribute" &&
      relevantBasisIds.includes(tag.tagId) &&
      (category === "expertise" || category === "experience" || category === "role" || category === "evidence")
    );
  });
  return {
    profile,
    activeTags,
    relevantContributions,
    coveredSlotIds: coveredSlots.map((slot) => slot.id),
    coveredKinds: unique(coveredSlots.map((slot) => slot.kind)),
    relevance: 0.6 * contributionPart + 0.4 * topicPart,
    basis: basisTags.length === 0 ? 0 : Math.max(...basisTags.map((tag) => tag.confidence)),
  };
}

function jaccard(a: Features, b: Features): number {
  const left = new Set([...a.relevantContributions, ...a.coveredSlotIds.map((id) => `slot:${id}`)]);
  const right = new Set([...b.relevantContributions, ...b.coveredSlotIds.map((id) => `slot:${id}`)]);
  const union = new Set([...left, ...right]);
  if (union.size === 0) return 0;
  return [...left].filter((item) => right.has(item)).length / union.size;
}

function novelty(selected: readonly Features[], candidate: Features, spec: DiscussionSpec): number {
  const covered = new Set(selected.flatMap((item) => item.coveredSlotIds));
  const totalWeight = spec.slots.reduce((sum, slot) => sum + (slot.required ? 2 : 1), 0) || 1;
  const added = spec.slots
    .filter((slot) => candidate.coveredSlotIds.includes(slot.id) && !covered.has(slot.id))
    .reduce((sum, slot) => sum + (slot.required ? 2 : 1), 0);
  return added / totalWeight;
}

function score(selected: readonly Features[], candidate: Features, spec: DiscussionSpec): ScoreBreakdown {
  const redundancy = selected.length === 0 ? 0 : Math.max(...selected.map((member) => jaccard(member, candidate)));
  const reputation = candidate.profile.conversationReputation;
  const conversationFit = reputation
    ? clamp((reputation.suitability + reputation.inspiration) / 10)
    : 0.5;
  const result = {
    relevance: 0.35 * candidate.relevance,
    basis: 0.2 * candidate.basis,
    novelty: 0.25 * novelty(selected, candidate, spec),
    response: 0.08 * candidate.profile.responseProbability,
    completion: 0.04 * candidate.profile.completionRate,
    conversationFit: 0.08 * conversationFit,
    redundancyPenalty: 0.2 * redundancy,
    total: 0,
  };
  result.total = result.relevance + result.basis + result.novelty + result.response + result.completion - result.redundancyPenalty;
  return result;
}

function learnCoverage(member: Features, peers: readonly Features[], spec: DiscussionSpec): string[] {
  const learns = unique(member.activeTags.filter((tag) => tag.intent === "learn").map((tag) => tag.tagId));
  const peerContributions = unique(peers.flatMap((peer) => peer.activeTags.filter((tag) => tag.intent === "contribute").map((tag) => tag.tagId)));
  const peerSlots = unique(peers.flatMap((peer) => peer.coveredSlotIds));
  const peerLearnables = spec.slots.filter((slot) => peerSlots.includes(slot.id)).flatMap((slot) => slot.learnableTagIds);
  return learns.filter(
    (tagId) =>
      spec.problemCanCoverLearnTagIds.includes(tagId) ||
      peerContributions.includes(tagId) ||
      peerLearnables.includes(tagId),
  );
}

function hasDiversity(group: readonly Features[]): boolean {
  return new Set(group.flatMap((member) => member.coveredKinds)).size >= 3;
}

function learnsCovered(group: readonly Features[], spec: DiscussionSpec): boolean {
  return group.every((member) => learnCoverage(member, group.filter((peer) => peer !== member), spec).length >= 1);
}

function respectsBlocks(group: readonly Features[]): boolean {
  return group.every((member, index) =>
    group.slice(index + 1).every((peer) =>
      !member.profile.blockedUserIds.includes(peer.profile.id) &&
      !peer.profile.blockedUserIds.includes(member.profile.id),
    ),
  );
}

function validGroup(group: readonly Features[], spec: DiscussionSpec): boolean {
  return (
    group.length >= spec.minMembers &&
    group.length <= spec.maxMembers &&
    respectsBlocks(group) &&
    hasDiversity(group) &&
    learnsCovered(group, spec)
  );
}

function violatesSimilarity(selected: readonly Features[], candidate: Features): boolean {
  return selected.filter((member) => jaccard(member, candidate) >= 0.72).length >= 2;
}

function compareCandidate(a: Features, b: Features, selected: readonly Features[], spec: DiscussionSpec, assemblySeed: string): number {
  const sa = score(selected, a, spec);
  const sb = score(selected, b, spec);
  return (
    sb.total - sa.total ||
    novelty(selected, b, spec) - novelty(selected, a, spec) ||
    b.relevance - a.relevance ||
    b.basis - a.basis ||
    seededHash(`${assemblySeed}:${a.profile.id}`) - seededHash(`${assemblySeed}:${b.profile.id}`) ||
    a.profile.id.localeCompare(b.profile.id)
  );
}

function compareAnchor(a: Features, b: Features, assemblySeed: string): number {
  const reputation = (profile: UserProfile) => profile.conversationReputation
    ? clamp((profile.conversationReputation.suitability + profile.conversationReputation.inspiration) / 10)
    : 0.5;
  const baseA = 0.35 * a.relevance + 0.2 * a.basis + 0.08 * a.profile.responseProbability + 0.04 * a.profile.completionRate + 0.08 * reputation(a.profile);
  const baseB = 0.35 * b.relevance + 0.2 * b.basis + 0.08 * b.profile.responseProbability + 0.04 * b.profile.completionRate + 0.08 * reputation(b.profile);
  return baseB - baseA || b.relevance - a.relevance || b.basis - a.basis ||
    seededHash(`${assemblySeed}:${a.profile.id}`) - seededHash(`${assemblySeed}:${b.profile.id}`) ||
    a.profile.id.localeCompare(b.profile.id);
}

function combinations<T>(values: readonly T[], size: number, start = 0, prefix: readonly T[] = []): T[][] {
  if (prefix.length === size) return [[...prefix]];
  const result: T[][] = [];
  for (let index = start; index <= values.length - (size - prefix.length); index += 1) {
    result.push(...combinations(values, size, index + 1, [...prefix, values[index]]));
  }
  return result;
}

function findRepair(pool: readonly Features[], anchor: Features, spec: DiscussionSpec, assemblySeed: string): Features[] | null {
  for (let size = spec.minMembers; size <= spec.maxMembers; size += 1) {
    const candidates = combinations(pool.filter((item) => item !== anchor), size - 1)
      .map((rest) => [anchor, ...rest])
      .filter((group) => validGroup(group, spec))
      .filter((group) => group.every((candidate, index) => !violatesSimilarity(group.slice(0, index), candidate)))
      .sort((a, b) => {
        const aScore = a.reduce((sum, item, index) => sum + score(a.slice(0, index), item, spec).total, 0);
        const bScore = b.reduce((sum, item, index) => sum + score(b.slice(0, index), item, spec).total, 0);
        const aKey = a.map((item) => item.profile.id).sort().join("|");
        const bKey = b.map((item) => item.profile.id).sort().join("|");
        return bScore - aScore || seededHash(`${assemblySeed}:${aKey}`) - seededHash(`${assemblySeed}:${bKey}`) || aKey.localeCompare(bKey);
      });
    if (candidates[0]) return candidates[0];
  }
  return null;
}

function eligibleProfiles(profiles: readonly UserProfile[], spec: DiscussionSpec, now: Date): { eligible: Features[]; availableCount: number } {
  const gatePassed = profiles.filter((profile) => validateProfileGate(profile).ok);
  const available = gatePassed.filter((profile) => isAvailableNow(profile, now, spec.durationHours));
  const eligible = available
    .map((profile) => makeFeatures(profile, spec))
    .filter((candidate) => candidate.relevantContributions.length >= 1 && candidate.relevance >= spec.minRelevance)
    .sort((a, b) => a.profile.id.localeCompare(b.profile.id));
  return { eligible, availableCount: available.length };
}

function buildSuccess(group: readonly Features[], spec: DiscussionSpec, now: Date, assemblySeed: string): MatchSuccess {
  const assembled = [...group].sort((a, b) =>
    seededHash(`${assemblySeed}:${a.profile.id}`) - seededHash(`${assemblySeed}:${b.profile.id}`) ||
    a.profile.id.localeCompare(b.profile.id),
  );
  const coveredSlotIds = unique(assembled.flatMap((member) => member.coveredSlotIds));
  const members: MatchMember[] = assembled.map((member, index) => {
    const coveredLearnTagIds = learnCoverage(member, assembled.filter((peer) => peer !== member), spec);
    const labels = spec.slots.filter((slot) => member.coveredSlotIds.includes(slot.id)).map((slot) => slot.label);
    return {
      userId: member.profile.id,
      role: index === 0 ? "anchor" : "complement",
      contributionTagIds: member.relevantContributions,
      coveredSlotIds: member.coveredSlotIds,
      coveredLearnTagIds,
      score: score(assembled.slice(0, index), member, spec),
      explanation: `${member.profile.displayName}与问题相关，并带来${labels.join("、") || "相关实践"}。`,
    };
  });
  const missingSlotIds = spec.slots.filter((slot) => !coveredSlotIds.includes(slot.id)).map((slot) => slot.id);
  return {
    kind: "matched",
    algorithmVersion: "constraint-lottery-v1",
    assemblyMethod: "hard-constraints-then-seeded-lottery",
    discussionSpecId: spec.id,
    members,
    coveredSlotIds,
    missingSlotIds,
    explanation: `先按标签相关性与视角互补筛选，再以场景种子可复现抽签组桌；覆盖 ${coveredSlotIds.length} 个视角槽位。`,
    createdAt: now.toISOString(),
  };
}

export function matchDiscussion(profiles: readonly UserProfile[], spec: DiscussionSpec, now: Date, assemblySeed = spec.id): MatchResult {
  const gatePassedCount = profiles.filter((profile) => validateProfileGate(profile).ok).length;
  const { eligible, availableCount } = eligibleProfiles(profiles, spec, now);
  const allSlotIds = spec.slots.map((slot) => slot.id);
  if (eligible.length < spec.minMembers) {
    const availabilityMismatch = gatePassedCount >= spec.minMembers && availableCount < spec.minMembers;
    return {
      kind: "degraded",
      code: availabilityMismatch ? "AVAILABILITY_MISMATCH" : "INSUFFICIENT_ELIGIBLE_CANDIDATES",
      eligibleCount: eligible.length,
      missingSlotIds: allSlotIds,
      message: availabilityMismatch ? "当前响应窗口内的成员不足。" : "与问题相关且完成标签确认的成员不足。",
    };
  }

  const anchors = [...eligible].sort((a, b) => compareAnchor(a, b, assemblySeed));
  const anchor = anchors[0];
  let group: Features[] = [anchor];
  let remaining = eligible.filter((item) => item !== anchor);
  while (group.length < spec.maxMembers && remaining.length > 0) {
    const ranked = [...remaining]
      .filter((candidate) => !violatesSimilarity(group, candidate))
      .filter((candidate) => respectsBlocks([...group, candidate]))
      .sort((a, b) => compareCandidate(a, b, group, spec, assemblySeed));
    const next = ranked[0];
    if (!next) break;
    const alreadyValid = validGroup(group, spec);
    if (alreadyValid && novelty(group, next, spec) <= 0) break;
    group = [...group, next];
    remaining = remaining.filter((item) => item !== next);
  }

  if (!validGroup(group, spec)) {
    group = anchors.map((candidateAnchor) => findRepair(eligible, candidateAnchor, spec, assemblySeed)).find(Boolean) ?? group;
  }
  if (!validGroup(group, spec)) {
    const kinds = new Set(eligible.flatMap((item) => item.coveredKinds));
    const hasPotentialGroup = combinations(eligible, spec.minMembers).some((candidateGroup) => respectsBlocks(candidateGroup));
    const code: MatchDegraded["code"] = !hasPotentialGroup
      ? "BLOCK_CONFLICT"
      : kinds.size < 3
        ? "INSUFFICIENT_PERSPECTIVE_DIVERSITY"
        : "UNCOVERED_LEARNING_NEEDS";
    const covered = unique(eligible.flatMap((item) => item.coveredSlotIds));
    return {
      kind: "degraded",
      code,
      eligibleCount: eligible.length,
      missingSlotIds: allSlotIds.filter((id) => !covered.includes(id)),
      message: code === "BLOCK_CONFLICT"
        ? "候选人之间存在屏蔽关系，无法组成安全的讨论桌。"
        : code === "INSUFFICIENT_PERSPECTIVE_DIVERSITY"
          ? "候选人相关，但还不足以形成三类互补视角。"
          : "候选人的学习需求暂时无法被问题或同行覆盖。",
    };
  }
  return buildSuccess(group, spec, now, assemblySeed);
}

export function replaceMatchMember(
  match: MatchSuccess,
  departedUserId: string,
  profiles: readonly UserProfile[],
  spec: DiscussionSpec,
  now: Date,
  assemblySeed = spec.id,
): MatchResult {
  const retainedIds = match.members.filter((member) => member.userId !== departedUserId).map((member) => member.userId);
  if (retainedIds.length === match.members.length) {
    return { kind: "degraded", code: "NO_VALID_REPLACEMENT", eligibleCount: 0, missingSlotIds: match.missingSlotIds, message: "待递补成员不在当前匹配中。" };
  }
  const { eligible } = eligibleProfiles(profiles, spec, now);
  const retained = retainedIds.map((id) => eligible.find((item) => item.profile.id === id)).filter((item): item is Features => Boolean(item));
  const unused = eligible.filter((item) => !match.members.some((member) => member.userId === item.profile.id));
  const replacement = [...unused]
    .filter((candidate) => !violatesSimilarity(retained, candidate))
    .filter((candidate) => respectsBlocks([...retained, candidate]))
    .sort((a, b) => compareCandidate(a, b, retained, spec, assemblySeed))
    .find((candidate) => validGroup([...retained, candidate], spec));
  if (!replacement) {
    return { kind: "degraded", code: "NO_VALID_REPLACEMENT", eligibleCount: unused.length, missingSlotIds: spec.slots.filter((slot) => !retained.flatMap((item) => item.coveredSlotIds).includes(slot.id)).map((slot) => slot.id), message: "没有可在当前响应窗口内补足视角的候选人。" };
  }
  const departedIndex = match.members.findIndex((member) => member.userId === departedUserId);
  const rebuilt = [...retained];
  rebuilt.splice(Math.min(departedIndex, rebuilt.length), 0, replacement);
  return buildSuccess(rebuilt, spec, now, assemblySeed);
}
