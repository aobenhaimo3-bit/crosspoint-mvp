import { describe, expect, it } from "vitest";
import type { PositionCard, Room } from "./room";
import { deriveDiscussionHeadline, synthesizeDiscussion } from "./summary";

const NOW = "2026-09-14T12:00:00.000Z";

function roomWith(judgments: readonly string[], options: { imagesOnly?: boolean } = {}): Room {
  const positions: PositionCard[] = judgments.map((judgment, index) => ({
    id: `position-${index}`,
    authorId: `user-${index}`,
    judgment,
    reasons: [],
    evidence: [],
    uncertainties: [],
    ...(options.imagesOnly ? { images: [{ id: `image-${index}`, name: "note.png", mimeType: "image/png", byteSize: 1, dataUrl: "data:image/png;base64,AA==" }] } : {}),
    submittedAt: NOW,
  }));
  return {
    id: "headline-room",
    state: "SYNTHESIS",
    revision: 1,
    inviteDeadline: NOW,
    durationHours: 12,
    members: positions.map((position) => ({ userId: position.authorId, status: "active" as const })),
    perspectiveKinds: {},
    positions,
    responses: [],
  };
}

const lengthOf = (value: string) => [...new Intl.Segmenter("zh-CN", { granularity: "grapheme" }).segment(value)].length;

describe("deriveDiscussionHeadline", () => {
  const question = "AI 进入工作流后，我们怎样重新定义一份值得投入的工作？";
  const judgments = [
    "值得投入的工作，应当让人看见自己的判断如何影响真实的人与组织。",
    "值得投入的工作不是排斥自动化，而是保留理解系统、验证结果与承担后果的空间。",
    "一份工作是否值得投入，不能只由效率衡量，还要看它是否支持人的主体性。",
    "值得投入的 AI 工作流，应让人负责关键取舍，并能追踪自己的判断如何改善结果。",
  ];

  it("extracts a concise content-derived clause instead of joining openings", () => {
    const headline = deriveDiscussionHeadline(roomWith(judgments), question);
    expect(headline).toMatch(/判断|结果/);
    expect(lengthOf(headline)).toBeGreaterThanOrEqual(12);
    expect(lengthOf(headline)).toBeLessThanOrEqual(28);
    expect(headline).not.toMatch(/圆桌形成|开场判断|；/);
    expect(headline).not.toMatch(/^(?:并|而是|还要)/);
    expect(judgments.every((judgment) => headline !== judgment)).toBe(true);
    expect(synthesizeDiscussion(roomWith(judgments), question).headline).toBe(headline);
  });

  it("keeps the terse Demo conversation focused on an interpretable ability signal", () => {
    const room = roomWith([
      "企业可能更需要提示词工程的人才吧，比如说Context engineering这样",
      "会vibecoding就行了",
      "我本身是科班的，他问我一些技术问题我觉得比较合理",
      "我觉得问实习项目经历吧",
    ]);
    const withResponses: Room = { ...room, responses: [
      { id:"response-0", authorId:"user-1", targetMessageId:"position-3", relation:"complementary", content:"什么项目经历？到什么程度？", submittedAt:NOW },
      { id:"response-1", authorId:"user-3", targetMessageId:"position-2", relation:"complementary", content:"如果代码能力一般看不懂代码呢？", submittedAt:NOW },
      { id:"response-2", authorId:"user-2", targetMessageId:"response-1", relation:"complementary", content:"测试补齐：可以把代码能力拆成阅读、验证和定位问题，让非科班成员也能贡献判断。", submittedAt:NOW },
      { id:"response-3", authorId:"user-0", targetMessageId:"position-1", relation:"complementary", content:"测试补齐：仅会生成并不等于具备判断力，关键还在于能否解释选择并承担结果。", submittedAt:NOW },
    ] };
    const headline = deriveDiscussionHeadline(withResponses, "当作品集都能由 AI 辅助完成，企业如何验证真实能力？");
    expect(headline).toBe("可以把代码能力拆成阅读、验证和定位问题");
    expect(lengthOf(headline)).toBeLessThanOrEqual(24);
    expect(headline).not.toContain("圆桌形成");
  });

  it("is stable when position order changes", () => {
    expect(deriveDiscussionHeadline(roomWith(judgments), question))
      .toBe(deriveDiscussionHeadline(roomWith([...judgments].reverse()), question));
  });

  it("reports dispersed views honestly", () => {
    const headline = deriveDiscussionHeadline(roomWith([
      "课程评价应关注长期迁移。",
      "招聘流程必须公开薪酬区间。",
      "城市空间首先保障步行安全。",
    ]), "技术变化会带来什么影响？");
    expect(headline).toBe("观点仍较分散，尚未形成明确交点");
  });

  it("preserves negation in a selected clause", () => {
    const headline = deriveDiscussionHeadline(roomWith([
      "能力验证不能只看最终作品，还应观察过程证据。",
      "招聘不能只看最终作品，需要核验真实的过程证据。",
    ]), "企业如何验证候选人的能力？");
    expect(headline).toContain("不能");
  });

  it("truncates long text without splitting emoji graphemes or an English word", () => {
    const long = "团队需要保留 Context engineering 与人工判断👨‍👩‍👧‍👦才能持续验证非常复杂而且不断变化的真实业务结果";
    const headline = deriveDiscussionHeadline(roomWith([long, long.replace("团队", "企业")]), "怎样改善协作？");
    expect(lengthOf(headline)).toBeLessThanOrEqual(32);
    expect(headline).toMatch(/…$/);
    expect(headline).not.toMatch(/enginee…$/i);
    expect(headline).not.toContain("�");
  });

  it("handles image-only submissions without inventing a topic", () => {
    expect(deriveDiscussionHeadline(roomWith(["", ""], { imagesOnly: true }), question))
      .toBe("本轮以图片为主，暂无可提炼的文字交点");
  });
});
