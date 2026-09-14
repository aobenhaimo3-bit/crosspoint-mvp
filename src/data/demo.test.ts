import { describe, expect, it } from "vitest";
import { STANDARD_TAGS, matchDiscussion, recommendQuestionsForProfile, replaceMatchMember, validateProfileGate } from "@/domain";
import { DEMO_QUESTION, DEMO_SOURCE_TOPIC, buildOnboardingProfile, canonicalDemoProfiles, canonicalIdForLabel, demoDiscussionSpec, discussionSpecs, getSummaryDraft, initialDemoProfiles, personas, topicTagGroups, topicTags } from "./demo";

const now = new Date("2026-09-14T12:00:00.000Z");

describe("CrossPoint demo fixtures", () => {
  it("starts from complementary tags, then offers an open Zhihu-derived social question for a 12-hour room", () => {
    expect(personas.slice(0, 4).map((persona) => persona.role)).toEqual(["商科学生", "计算机专业学生", "哲学研究生", "社会学研究者"]);
    expect(demoDiscussionSpec.question).toBe(DEMO_QUESTION);
    expect(demoDiscussionSpec.durationHours).toBe(12);
    expect(demoDiscussionSpec.source).toMatchObject({
      platform: "zhihu",
      title: DEMO_SOURCE_TOPIC,
      url: "https://www.zhihu.com/question/1992917921941439400",
      retrievedAt: "2026-09-15",
    });
  });

  it("ranks questions from the viewer's confirmed tags before room matching", () => {
    const base = canonicalDemoProfiles.find((profile) => profile.id === "computer")!;
    const educationFirst = {
      ...base,
      tags: [
        ...base.tags.filter((tag) => tag.intent !== "topic"),
        ...["topic.ai", "topic.education", "topic.skills"].map((tagId) => ({
          tagId, intent: "topic" as const, source: "self" as const, confidence: 0.95,
          visibility: "matching_only" as const, confirmed: true, matchingAllowed: true,
        })),
      ],
    };
    expect(recommendQuestionsForProfile(educationFirst, discussionSpecs)[0]?.questionId).toBe("q-ai-curriculum");
  });

  it("offers 48 unique interest tags in six parallel categories", () => {
    expect(topicTagGroups).toHaveLength(6);
    expect(topicTagGroups.every((group) => group.items.length === 8)).toBe(true);
    expect(topicTags).toHaveLength(48);
    expect(new Set(topicTags)).toHaveLength(48);
    expect(new Set(topicTagGroups.map((group) => group.id))).toHaveLength(6);
    expect(new Set(topicTagGroups.map((group) => group.label))).toHaveLength(6);
  });

  it("keeps canonical topic IDs and labels unique and maps every UI interest", () => {
    const topicVocabulary = STANDARD_TAGS.filter((tag) => tag.category === "topic");
    expect(topicVocabulary).toHaveLength(48);
    expect(new Set(topicVocabulary.map((tag) => tag.id))).toHaveLength(48);
    expect(new Set(STANDARD_TAGS.map((tag) => tag.id))).toHaveLength(STANDARD_TAGS.length);
    expect(new Set(STANDARD_TAGS.map((tag) => tag.label))).toHaveLength(STANDARD_TAGS.length);
    expect(topicTags.map(canonicalIdForLabel).every(Boolean)).toBe(true);
    expect(canonicalIdForLabel("人工智能")).toBe("topic.ai");
    expect(canonicalIdForLabel("教育")).toBe("topic.education");
    expect(canonicalIdForLabel("就业")).toBe("topic.employment");
    expect(canonicalIdForLabel("大学与专业")).toBe("topic.university");
    expect(canonicalIdForLabel("职业发展")).toBe("topic.career");
    expect(canonicalIdForLabel("技能迁移")).toBe("topic.skills");
    expect(canonicalIdForLabel("未来工作")).toBe("topic.future_work");
    expect(topicTagGroups.every((group) => group.description.trim().length > 0)).toBe(true);
    expect(topicTags.map(canonicalIdForLabel).sort()).toEqual(topicVocabulary.map((tag) => tag.id).sort());
  });

  it("keeps every Demo profile and discussion reference inside the canonical vocabulary", () => {
    const tagIds = new Set(STANDARD_TAGS.map((tag) => tag.id));
    expect(canonicalDemoProfiles.every((profile) => validateProfileGate(profile).ok)).toBe(true);
    for (const profile of canonicalDemoProfiles) {
      expect(profile.tags.every((tag) => tagIds.has(tag.tagId))).toBe(true);
    }
    for (const spec of discussionSpecs) {
      const references = [
        ...spec.topicTagIds,
        ...(spec.relatedTopicTagIds ?? []),
        ...spec.relevantContributionTagIds,
        ...spec.problemCanCoverLearnTagIds,
        ...spec.slots.flatMap((slot) => [...slot.matchedByTagIds, ...slot.learnableTagIds]),
      ];
      expect(references.every((tagId) => tagIds.has(tagId))).toBe(true);
    }
  });

  it("accepts an interest profile selected across categories", () => {
    const profile = buildOnboardingProfile({
      topics: ["人工智能", "组织管理", "教育公平", "劳动关系", "公共政策", "科技伦理"],
      role: "商科 / 组织",
      contributes: ["商业与组织视角", "个人经历"],
      learns: ["技术实践视角", "未来工作"],
      perspective: "社会结构视角",
      availability: "时间灵活，12 小时内回应",
    });

    expect(validateProfileGate(profile)).toMatchObject({ ok: true, errors: [] });
    expect(profile.tags.filter((tag) => tag.intent === "topic").map((tag) => tag.tagId)).toEqual([
      "topic.ai",
      "topic.organization_management",
      "topic.education_equity",
      "topic.labor_relations",
      "topic.public_policy",
      "topic.tech_ethics",
    ]);
  });

  it("uses broader category interests as secondary recommendation signals", () => {
    const baseInput = {
      role: "商科 / 组织",
      contributes: ["商业与组织视角", "个人经历"],
      learns: ["技术实践视角", "未来工作"],
      perspective: "社会结构视角",
      availability: "时间灵活，12 小时内回应",
    };
    const skillProfile = buildOnboardingProfile({
      ...baseInput,
      topics: ["产品与交互", "人才培养", "招聘与选才"],
    });
    const firstOpportunityProfile = buildOnboardingProfile({
      ...baseInput,
      topics: ["教育公平", "青年成长", "社会保障"],
    });
    expect(recommendQuestionsForProfile(skillProfile, discussionSpecs)[0]?.questionId).toBe("q-skill-proof");
    expect(recommendQuestionsForProfile(firstOpportunityProfile, discussionSpecs)[0]?.questionId).toBe("q-first-experience");
  });

  it("does not treat learn-intent topic tags as selected interests when ranking questions", () => {
    const profile = buildOnboardingProfile({
      topics: ["商业模式", "组织管理", "产业趋势"],
      role: "商科 / 组织",
      contributes: ["商业与组织视角", "个人经历"],
      learns: ["技术实践视角", "未来工作"],
      perspective: "社会结构视角",
      availability: "时间灵活，12 小时内回应",
    });
    const recommendations = recommendQuestionsForProfile(profile, discussionSpecs);
    expect(recommendations[0]?.questionId).toBe("q-ai-major");
    expect(recommendations.every((item) => !item.matchedTagIds.includes("topic.future_work"))).toBe(true);
  });

  it("uses the opportunity-fairness profile as a valid timeout replacement", () => {
    const initial = matchDiscussion(initialDemoProfiles, demoDiscussionSpec, now);
    expect(initial.kind).toBe("matched");
    if (initial.kind !== "matched") return;

    expect(initial.members.map((member) => member.userId)).toContain("computer");
    expect(initial.members.map((member) => member.userId)).not.toContain("practitioner");

    const replacement = replaceMatchMember(initial, "computer", canonicalDemoProfiles, demoDiscussionSpec, now);
    expect(replacement.kind).toBe("matched");
    if (replacement.kind !== "matched") return;
    expect(replacement.members.map((member) => member.userId)).toContain("practitioner");
    expect(replacement.coveredSlotIds).toContain("industry");
  });

  it("keeps the next-loop summaries tied to the selected question", () => {
    expect(getSummaryDraft("q-skill-proof").consensus[0]).toContain("过程证据");
    expect(getSummaryDraft("q-first-experience").unresolvedQuestions[0]).toContain("实践证据");
  });
});
