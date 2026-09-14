import type { DiscussionSpec } from "./models";
import { getResponseTargetMessageId, type DiscussionSummary, type Room } from "./room";

const uniqueText = (values: readonly string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))];

const HEADLINE_FALLBACK = "观点仍较分散，尚未形成明确交点";
const IMAGE_ONLY_HEADLINE = "本轮以图片为主，暂无可提炼的文字交点";
const MAX_HEADLINE_GRAPHEMES = 32;
const DISCOURSE_PREFIX = /^(?:测试补齐|我(?:的)?(?:认为|觉得|判断是)|在我看来|总体而言|总的来说|因此|所以|但是|不过|同时|而且|并且|以及|另外|而是|还要|并(?=能|可|应|要))[，,:：\s]*/;
const STOP_WORDS = new Set([
  "的", "了", "和", "与", "或", "而", "也", "还", "是", "在", "让", "把", "被", "由", "对", "从", "到", "为", "给", "中", "后", "更", "很", "都",
  "这", "那", "一个", "一种", "我们", "自己", "是否", "如何", "什么", "可能", "应该", "应当", "需要", "可以", "能够", "值得", "投入",
]);

const wordSegmenter = new Intl.Segmenter("zh-CN", { granularity: "word" });
const graphemeSegmenter = new Intl.Segmenter("zh-CN", { granularity: "grapheme" });

const normalizeText = (value: string) => value
  .normalize("NFKC")
  .replace(/\s+/g, " ")
  .trim()
  .replace(/[。！？!?；;，,:：、\s]+$/u, "");

const graphemes = (value: string) => [...graphemeSegmenter.segment(value)].map((item) => item.segment);

function meaningfulWords(value: string): string[] {
  return [...wordSegmenter.segment(value)]
    .filter((item) => item.isWordLike)
    .map((item) => item.segment.toLocaleLowerCase("zh-CN"))
    .filter((word) => !STOP_WORDS.has(word)
      && (/\p{Script=Han}/u.test(word) ? graphemes(word).length >= 2 : word.length >= 2));
}

function shortenHeadline(value: string): string {
  const cleaned = normalizeText(value).replace(DISCOURSE_PREFIX, "");
  if (graphemes(cleaned).length <= MAX_HEADLINE_GRAPHEMES) return cleaned;

  // Prefer a word boundary so an English term such as "Context engineering" is not cut in half.
  const segments = [...wordSegmenter.segment(cleaned)];
  let boundary = 0;
  for (const segment of segments) {
    const end = segment.index + segment.segment.length;
    if (graphemes(cleaned.slice(0, end)).length > MAX_HEADLINE_GRAPHEMES - 1) break;
    boundary = end;
  }
  const prefix = normalizeText(cleaned.slice(0, boundary));
  if (prefix) return `${prefix}…`;
  return `${graphemes(cleaned).slice(0, MAX_HEADLINE_GRAPHEMES - 1).join("")}…`;
}

/**
 * Selects one representative clause from the real timeline. It never joins
 * participants' prose: cross-author vocabulary and response relations only
 * decide which original clause best represents an actual point of overlap.
 */
export function deriveDiscussionHeadline(room: Room, question: string): string {
  const positions = room.positions
    .map((position) => ({ ...position, text: normalizeText(position.judgment) }))
    .filter((position) => Boolean(position.text));
  const messages = [
    ...positions.map((position) => ({ id:position.id, authorId:position.authorId, text:position.text, kind:"position" as const })),
    ...room.responses
      .map((response) => ({ id:response.id, authorId:response.authorId, text:normalizeText(response.content), kind:"response" as const }))
      .filter((response) => Boolean(response.text)),
  ];
  if (!messages.length) {
    return room.positions.some((position) => position.images?.length) ? IMAGE_ONLY_HEADLINE : HEADLINE_FALLBACK;
  }

  const questionWords = new Set(meaningfulWords(question));
  const wordsByAuthor = new Map<string, Set<string>>();
  for (const message of messages) {
    const words = wordsByAuthor.get(message.authorId) ?? new Set<string>();
    meaningfulWords(message.text).forEach((word) => words.add(word));
    wordsByAuthor.set(message.authorId, words);
  }
  const authorFrequency = new Map<string, number>();
  for (const words of wordsByAuthor.values()) {
    for (const word of words) authorFrequency.set(word, (authorFrequency.get(word) ?? 0) + 1);
  }

  const responseSignals = new Map<string, { complementary: Set<string>; different: Set<string> }>();
  for (const response of room.responses) {
    const targetId = getResponseTargetMessageId(response);
    if (!targetId) continue;
    const signal = responseSignals.get(targetId) ?? { complementary: new Set<string>(), different: new Set<string>() };
    signal[response.relation].add(response.authorId);
    responseSignals.set(targetId, signal);
  }

  const candidates = messages.flatMap((message) => {
    const clauses = message.text.split(/[，,。；！？!?;]+/u).map(normalizeText).filter(Boolean);
    return (clauses.length ? clauses : [message.text]).map((clause) => {
      const words = [...new Set(meaningfulWords(clause))];
      const sharedWords = words.filter((word) => (authorFrequency.get(word) ?? 0) >= 2);
      const sharedCoreWords = sharedWords.filter((word) => !questionWords.has(word));
      const relatedAuthors = new Set<string>([message.authorId]);
      for (const [authorId, authorWords] of wordsByAuthor) {
        if (sharedCoreWords.some((word) => authorWords.has(word))) relatedAuthors.add(authorId);
      }
      const signal = responseSignals.get(message.id) ?? { complementary: new Set<string>(), different: new Set<string>() };
      const complementary = new Set([...signal.complementary].filter((authorId) => authorId !== message.authorId)).size;
      const different = new Set([...signal.different].filter((authorId) => authorId !== message.authorId)).size;
      const sharedWeight = sharedWords.reduce((total, word) => total + ((authorFrequency.get(word) ?? 0) - 1) * (questionWords.has(word) ? 1 : 4), 0);
      const topicCoverage = words.filter((word) => questionWords.has(word)).length;
      const length = graphemes(clause).length;
      return {
        clause,
        qualified: relatedAuthors.size >= 2 || complementary > 0,
        score: relatedAuthors.size * 6 + sharedWeight + topicCoverage * 2 + complementary * 3 - different * 3
          + (message.kind === "response" ? 2 : 0)
          + Math.min(words.length, 6) / 10 - Math.abs(Math.min(length, 32) - 20) / 100,
      };
    });
  });

  const best = candidates
    .filter((candidate) => candidate.qualified)
    .sort((left, right) => right.score - left.score || left.clause.localeCompare(right.clause, "zh-CN"))[0];
  return best ? shortenHeadline(best.clause) : HEADLINE_FALLBACK;
}

export function synthesizeDiscussion(room: Room, question = ""): Omit<DiscussionSummary, "generatedAt"> {
  const judgments = uniqueText(room.positions.map((position) => position.judgment));
  const evidence = uniqueText(room.positions.flatMap((position) => position.evidence));
  const uncertainties = uniqueText(room.positions.flatMap((position) => position.uncertainties));
  const responseInsights = uniqueText(room.responses.map((response) => response.content));
  return {
    headline: deriveDiscussionHeadline(room, question),
    consensus: judgments.length
      ? [`圆桌形成了 ${judgments.length} 个开场判断：${judgments.slice(0, 2).join("；")}`]
      : ["本轮尚无足够立场材料。"],
    disagreements: judgments.length > 1 ? judgments : ["现有判断尚未形成可辨认的分歧。"],
    evidenceGaps: uncertainties.length ? uncertainties : evidence.length ? ["现有证据仍需要跨样本验证。"] : ["缺少可核验的证据。"],
    unresolvedQuestions: uniqueText([...uncertainties, ...responseInsights]).slice(0, 6),
  };
}

export function buildPerspectiveMap(room: Room, spec: DiscussionSpec) {
  const nodes = room.positions.map((position) => ({
    userId: position.authorId,
    judgment: position.judgment || (position.images?.length ? "分享了一张图片" : "未提供文字判断"),
    evidence: position.evidence,
    uncertainties: position.uncertainties,
  }));
  const messageOwners = new Map(room.positions.map((position) => [position.id, position.authorId]));
  const edges = room.responses.flatMap((response) => {
    const target = messageOwners.get(getResponseTargetMessageId(response) ?? "");
    messageOwners.set(response.id, response.authorId);
    return target ? [{ fromUserId: response.authorId, toUserId: target, relation: response.relation, content: response.content }] : [];
  });
  const covered = new Set(Object.entries(room.perspectiveKinds)
    .filter(([userId]) => room.members.some((member) => member.userId === userId && (member.status === "active" || member.status === "exited")))
    .flatMap(([, kinds]) => kinds));
  const vacancies = spec.slots.filter((slot) => !covered.has(slot.id)).map((slot) => ({ slotId: slot.id, label: slot.label }));
  return { nodes, edges, vacancies };
}
