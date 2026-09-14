import type { DiscussionSpec, DiscussionSummary, ProfileTag, UserProfile } from "@/domain";
import { STANDARD_TAG_BY_ID, mapFreeTextToStandardTags } from "@/domain";

export type PersonaId = "finance" | "computer" | "recruiter" | "educator" | "practitioner";

export type Persona = {
  id: PersonaId;
  name: string;
  role: string;
  mark: string;
  contributes: string[];
  learns: string[];
  color: "cyan" | "amber" | "coral" | "violet" | "mint";
};

export const DEMO_SOURCE_TOPIC = "2026年，站在AI与人文的十字路口：00后如何定义自己的“新饭碗”与“新活法”？";
export const DEMO_QUESTION = "AI 进入工作流后，我们怎样重新定义一份值得投入的工作？";

export const personas: Persona[] = [
  { id: "finance", name: "林澈", role: "商科学生", mark: "商业 × 组织", contributes: ["组织激励", "商业判断"], learns: ["技术边界", "人文价值"], color: "cyan" },
  { id: "computer", name: "周屿", role: "计算机专业学生", mark: "计算机 × AI", contributes: ["技术实践", "工作流观察"], learns: ["劳动体验", "伦理边界"], color: "amber" },
  { id: "recruiter", name: "许舟", role: "哲学研究生", mark: "哲学 × 科技伦理", contributes: ["价值判断", "技术伦理"], learns: ["组织现实", "社会结构"], color: "coral" },
  { id: "educator", name: "陈知遥", role: "社会学研究者", mark: "社会学 × 劳动", contributes: ["劳动研究", "社会结构"], learns: ["技术实践", "组织选择"], color: "violet" },
  { id: "practitioner", name: "顾言", role: "AI 产品实践者", mark: "AI × 产品", contributes: ["产品案例", "行业实践"], learns: ["人文价值", "劳动体验"], color: "mint" },
];

export type TopicTagGroup = {
  id: "technology" | "business" | "education" | "work" | "society" | "humanities";
  label: string;
  description: string;
  items: readonly string[];
};

export const topicTagGroups: readonly TopicTagGroup[] = [
  {
    id: "technology",
    label: "科技与工程",
    description: "关注技术本身、产品形态与开发者生态。",
    items: ["人工智能", "编程与软件开发", "数据科学", "网络安全", "机器人与智能硬件", "互联网与平台", "产品与交互", "开源与开发者生态"],
  },
  {
    id: "business",
    label: "商业与产业",
    description: "关注企业经营、市场变化与产业实践。",
    items: ["商业模式", "组织管理", "创业创新", "市场营销", "金融市场", "产业趋势", "消费与品牌", "企业数字化"],
  },
  {
    id: "education",
    label: "教育与成长",
    description: "关注学习过程、教育机会与人才成长。",
    items: ["教育", "大学与专业", "学习方法", "人才培养", "数字教育", "教育公平", "职业教育", "青年成长"],
  },
  {
    id: "work",
    label: "职业与劳动",
    description: "关注个人职业路径、组织生活与劳动变化。",
    items: ["就业", "职业发展", "未来工作", "技能迁移", "招聘与选才", "职场文化", "劳动关系", "灵活就业"],
  },
  {
    id: "society",
    label: "社会与公共",
    description: "关注制度、公共议题与群体生活。",
    items: ["公共政策", "法律与治理", "社会结构", "城乡与区域", "人口与代际", "社会保障", "媒体与舆论", "平台治理"],
  },
  {
    id: "humanities",
    label: "人文与价值",
    description: "关注技术时代中的价值、文化与人的体验。",
    items: ["哲学思辨", "科技伦理", "心理与幸福", "文化与身份", "历史观察", "文学与表达", "艺术与审美", "生命与意义"],
  },
];

export const topicTags = topicTagGroups.flatMap((group) => group.items);
export const contributeTags = ["商业与组织视角", "技术实践视角", "人文与伦理视角", "社会结构视角", "行业落地视角", "个人经历", "产品实践", "学术研究"];
export const learnTags = ["商业与组织视角", "技术实践视角", "人文与伦理视角", "社会结构视角", "行业落地视角", "长期职业视角", "未来工作"];
export const perspectiveTags = ["商业与组织视角", "技术实践视角", "人文与伦理视角", "社会结构视角", "行业落地视角"];

const byLabel = new Map([...STANDARD_TAG_BY_ID.values()].map((tag) => [tag.label, tag.id]));
export const canonicalIdForLabel = (label: string): string | undefined => byLabel.get(label);
const activeTag = (tagId: string, intent: ProfileTag["intent"], source: ProfileTag["source"] = "self"): ProfileTag => ({
  tagId, intent, source, confidence: source === "ai_suggested" ? 0.82 : 0.94,
  visibility: "matching_only", confirmed: true, matchingAllowed: true,
});

const alwaysAvailable = [{ timezone: "Asia/Shanghai", daysOfWeek: [0,1,2,3,4,5,6], startMinute: 0, endMinute: 1439, maxResponseHours: 12 }] as const;
function profile(id: PersonaId, name: string, identityTag: string, perspective: string, evidence: string, learn: string, metrics: [number, number], reputation: [number, number, number]): UserProfile {
  return { id, displayName: name, source: "demo", registered: true, matchingConsent: true, responseProbability: metrics[0], completionRate: metrics[1], blockedUserIds: [], availability: alwaysAvailable,
    conversationReputation: { count: reputation[0], suitability: reputation[1], inspiration: reputation[2] },
    zhihuHandle: `demo_${id}`,
    tags: [activeTag("topic.ai","topic"), activeTag("topic.employment","topic"), activeTag("topic.future_work","topic"), activeTag(identityTag,"contribute"), activeTag(perspective,"contribute"), activeTag(evidence,"contribute"), activeTag(learn,"learn"), activeTag("topic.future_work","learn"), activeTag("perspective.long_term","expected_perspective")],
  };
}

export const canonicalDemoProfiles: readonly UserProfile[] = [
  profile("finance", "林澈", "expertise.business", "perspective.business", "evidence.market", "perspective.technical", [.88,.91], [18,4.4,4.2]),
  profile("computer", "周屿", "role.engineer", "perspective.technical", "evidence.data", "perspective.philosophy", [.78,.86], [13,4.1,4.3]),
  profile("recruiter", "许舟", "expertise.philosophy", "perspective.philosophy", "evidence.research", "perspective.society", [.91,.93], [21,4.6,4.7]),
  profile("educator", "陈知遥", "expertise.sociology", "perspective.society", "evidence.research", "perspective.business", [.84,.9], [16,4.5,4.4]),
  profile("practitioner", "顾言", "role.product", "perspective.industry", "evidence.product", "perspective.philosophy", [.87,.89], [24,4.3,4.5]),
] as const;

// Bump the seeded Demo id when the product flow changes materially. This keeps
// an older local rehearsal recoverable while opening the redesigned flow cleanly.
export const DEMO_SCENARIO_ID = "crosspoint-four-user-demo-chat-v2";
export const INITIAL_DEMO_USER_IDS = ["finance", "computer", "recruiter", "educator"] as const satisfies readonly PersonaId[];
export const REPLACEMENT_DEMO_USER_ID = "practitioner" as const satisfies PersonaId;
export const initialDemoProfiles: readonly UserProfile[] = INITIAL_DEMO_USER_IDS.map((id) => canonicalDemoProfiles.find((profile) => profile.id === id)!);

export const demoDiscussionSpec: DiscussionSpec = {
  id: "spec-ai-major", questionId: "q-ai-major", question: DEMO_QUESTION,
  source: {
    platform: "zhihu",
    title: DEMO_SOURCE_TOPIC,
    url: "https://www.zhihu.com/question/1992917921941439400",
    retrievedAt: "2026-09-15",
  },
  topicTagIds: ["topic.ai","topic.employment","topic.future_work"],
  relatedTopicTagIds: [
    "topic.business_models", "topic.organization_management", "topic.entrepreneurship", "topic.marketing",
    "topic.financial_markets", "topic.industry_trends", "topic.consumer_brands", "topic.digital_transformation",
    "topic.workplace_culture", "topic.labor_relations", "topic.flexible_work", "topic.public_policy",
    "topic.law_governance", "topic.social_structure", "topic.urban_rural", "topic.demographics",
    "topic.social_security", "topic.media_discourse", "topic.platform_governance", "topic.philosophy",
    "topic.tech_ethics", "topic.psychology_wellbeing", "topic.culture_identity", "topic.history",
    "topic.literature", "topic.arts", "topic.meaning_of_life",
  ],
  relevantContributionTagIds: ["expertise.business","expertise.philosophy","expertise.sociology","role.engineer","role.product","perspective.business","perspective.technical","perspective.philosophy","perspective.society","perspective.industry","evidence.personal","evidence.data","evidence.market","evidence.research","evidence.product","evidence.case_study"],
  minRelevance: .35,
  slots: [
    { id:"business", label:"商业与组织", kind:"employer", required:true, matchedByTagIds:["perspective.business"], learnableTagIds:["perspective.business"] },
    { id:"technical", label:"技术实践", kind:"technical", required:true, matchedByTagIds:["perspective.technical"], learnableTagIds:["perspective.technical"] },
    { id:"philosophy", label:"人文与伦理", kind:"research_evidence", required:true, matchedByTagIds:["perspective.philosophy"], learnableTagIds:["perspective.philosophy"] },
    { id:"society", label:"社会结构", kind:"education", required:true, matchedByTagIds:["perspective.society"], learnableTagIds:["perspective.society"] },
    { id:"industry", label:"行业落地", kind:"industry", required:false, matchedByTagIds:["perspective.industry"], learnableTagIds:["perspective.industry"] },
  ],
  problemCanCoverLearnTagIds:["topic.future_work","perspective.long_term"], durationHours:12, inviteExpiresHours:12, minMembers:3, maxMembers:5,
};

export function suggestCanonicalTag(input: string) {
  const direct = mapFreeTextToStandardTags(input)[0];
  if (direct) return direct;
  if (/校招|面试|招聘/.test(input)) return STANDARD_TAG_BY_ID.get("expertise.recruiting");
  if (/课程|教学/.test(input)) return STANDARD_TAG_BY_ID.get("evidence.curriculum");
  if (/AI|大模型/i.test(input)) return STANDARD_TAG_BY_ID.get("topic.ai");
  return undefined;
}

export function buildOnboardingProfile(input: { topics: string[]; role: string; contributes: string[]; learns: string[]; perspective: string; availability: string; freeTextTagId?: string }): UserProfile {
  const ids = (labels: string[]) => labels.map(canonicalIdForLabel).filter((id): id is string => Boolean(id));
  const roleIds: Record<string,string> = {
    "商科 / 组织":"expertise.business",
    "计算机 / 工程":"role.engineer",
    "哲学 / 人文":"expertise.philosophy",
    "社会学 / 劳动":"expertise.sociology",
    "AI 产品 / 实践":"role.product",
    // Kept for older persisted Demo drafts and API clients.
    "学生 / 求职者":"role.student",
    "教师 / 教育研究者":"role.researcher",
    "招聘 / 人才发展":"role.recruiter",
    "AI 产品 / 行业实践":"role.product",
  };
  const freeTextTag = input.freeTextTagId ? STANDARD_TAG_BY_ID.get(input.freeTextTagId) : undefined;
  const freeTextIntent: ProfileTag["intent"] = freeTextTag?.category === "topic" ? "topic" : "contribute";
  const tags = [
    ...ids(input.topics).map((id) => activeTag(id,"topic")),
    ...(roleIds[input.role] ? [activeTag(roleIds[input.role],"contribute")] : []),
    ...ids(input.contributes).map((id) => activeTag(id,"contribute")),
    ...ids(input.learns).map((id) => activeTag(id,"learn")),
    ...(canonicalIdForLabel(input.perspective) ? [activeTag(canonicalIdForLabel(input.perspective)!,"expected_perspective")] : []),
    ...(freeTextTag ? [activeTag(freeTextTag.id,freeTextIntent,"ai_suggested")] : []),
  ];
  return { ...canonicalDemoProfiles[0], tags, availability:[{ timezone:"Asia/Shanghai", daysOfWeek:[0,1,2,3,4,5,6], startMinute:0, endMinute:1439, maxResponseHours: input.availability.includes("24") ? 24 : 12 }] };
}

export const positionDrafts: Record<PersonaId, { judgment: string; reason: string; evidence: string; uncertainty: string }> = {
  finance: { judgment: "值得投入的工作，应当让人看见自己的判断如何影响真实的人与组织。", reason: "AI 接管重复执行后，组织需要重新分配决策权、成长机会与成果回报。", evidence: "团队使用 AI 后交付更快，但新人参与关键决策的机会反而更少。", uncertainty: "效率收益如何转化为成员可感知的成长，而不只是更高指标？" },
  computer: { judgment: "值得投入的工作不是排斥自动化，而是保留理解系统、验证结果与承担后果的空间。", reason: "当生成成本下降，问题定义、边界识别和异常处理成为更核心的技术劳动。", evidence: "在 AI 辅助项目里，真正耗时的仍是确认需求、评价输出和处理失败案例。", uncertainty: "如果入门任务被自动化，新人从哪里建立足够的系统直觉？" },
  recruiter: { judgment: "一份工作是否值得投入，不能只由效率衡量，还要看它是否支持人的主体性和有意义的共同生活。", reason: "若人只负责为机器结果兜底，劳动可能更高效，却未必更自主或更有尊严。", evidence: "科技伦理讨论中，责任往往仍归于人，但人对系统的实际控制权并不对等。", uncertainty: "我们如何区分真正的自主选择与被技术流程包装后的被动服从？" },
  educator: { judgment: "值得投入的工作，需要提供稳定的关系、社会承认与可持续的生活，而不仅是有趣任务。", reason: "工作的意义由制度、身份和资源分配共同塑造，不能只靠个人调整心态。", evidence: "灵活就业带来自主性的同时，也可能把风险和保障成本转移给个人。", uncertainty: "不同阶层能否同样拥有选择有意义工作的余地？" },
  practitioner: { judgment: "值得投入的 AI 工作流，应让人负责关键取舍，并能追踪自己的判断如何改善结果。", reason: "好的产品流程把 AI 当作协作者，同时保留人工复核、反馈和升级路径。", evidence: "在真实产品团队中，明确评估标准和责任边界比单纯提高生成速度更能稳定质量。", uncertainty: "企业是否愿意为这些看似降低速度的人工判断环节持续付费？" },
};

export const relatedQuestions = [
  { id:"q-skill-proof", title: "当作品集都能由 AI 辅助完成，企业如何验证真实能力？", lenses: ["雇主视角", "能力证据", "教育公平"], activity: "4 个视角正在等待匹配" },
  { id:"q-ai-curriculum", title: "当 AI 成为日常协作者，我们如何判断自己仍在学习，而不只是完成任务？", lenses: ["人文价值", "学习过程", "技术实践"], activity: "3 个视角正在讨论" },
  { id:"q-first-experience", title: "当 AI 重塑入门工作，年轻人如何获得被信任的第一次机会？", lenses: ["行业实践", "社会结构", "组织设计"], activity: "需要技术实践者视角" },
];

export const discussionSpecs: readonly DiscussionSpec[] = [
  demoDiscussionSpec,
  ...relatedQuestions.map((question) => ({
    ...demoDiscussionSpec,
    id: `spec-${question.id}`,
    questionId: question.id,
    question: question.title,
    source: undefined,
    topicTagIds: question.id === "q-ai-curriculum"
      ? ["topic.ai", "topic.education", "topic.skills"]
      : question.id === "q-first-experience"
        ? ["topic.ai", "topic.employment", "topic.career"]
        : ["topic.ai", "topic.employment", "topic.skills"],
    relatedTopicTagIds: question.id === "q-ai-curriculum"
      ? ["topic.software_development", "topic.data_science", "topic.cybersecurity", "topic.robotics", "topic.internet_platforms", "topic.product_design", "topic.open_source", "topic.university", "topic.learning_methods", "topic.talent_development", "topic.digital_education", "topic.education_equity", "topic.vocational_education", "topic.youth_development", "topic.philosophy", "topic.tech_ethics"]
      : question.id === "q-first-experience"
        ? ["topic.organization_management", "topic.entrepreneurship", "topic.industry_trends", "topic.digital_transformation", "topic.university", "topic.talent_development", "topic.education_equity", "topic.vocational_education", "topic.youth_development", "topic.recruiting", "topic.workplace_culture", "topic.labor_relations", "topic.flexible_work", "topic.public_policy", "topic.social_structure", "topic.urban_rural", "topic.demographics", "topic.social_security"]
        : ["topic.software_development", "topic.data_science", "topic.product_design", "topic.open_source", "topic.organization_management", "topic.digital_transformation", "topic.university", "topic.learning_methods", "topic.talent_development", "topic.digital_education", "topic.education_equity", "topic.vocational_education", "topic.recruiting", "topic.platform_governance"],
  })),
];
export const getDiscussionSpec = (questionId: string | null | undefined): DiscussionSpec => discussionSpecs.find((spec) => spec.questionId === questionId) ?? demoDiscussionSpec;

const summaryDrafts: Record<string, Omit<DiscussionSummary, "generatedAt">> = {
  "q-ai-major": { consensus:["值得投入的工作需要保留人的判断、成长与结果责任"], disagreements:["效率、主体性与制度保障应如何排序"], evidenceGaps:["不同职业和阶层采用 AI 后的长期劳动体验"], unresolvedQuestions:["效率收益如何真正转化为人的成长与生活改善"] },
  "q-skill-proof": { consensus:["真实能力需要由过程证据与情境任务共同验证"], disagreements:["AI 辅助作品的能力归因边界在哪里"], evidenceGaps:["不同岗位验证方式的长期效度样本"], unresolvedQuestions:["怎样让低资源候选人公平获得验证机会"] },
  "q-ai-curriculum": { consensus:["课程需要同时训练基础判断与负责任的 AI 使用"], disagreements:["基础阶段应开放 AI 到什么程度"], evidenceGaps:["不同教学规则对长期学习效果的对照数据"], unresolvedQuestions:["怎样评价学生本人真正掌握的能力"] },
  "q-first-experience": { consensus:["新人仍需要可承担真实责任的渐进式实践入口"], disagreements:["企业、高校与平台应由谁承担培养成本"], evidenceGaps:["入门岗位变化与替代性实践的长期追踪"], unresolvedQuestions:["什么样的实践证据能被多方共同认可"] },
};
export const getSummaryDraft = (questionId: string | null | undefined): Omit<DiscussionSummary, "generatedAt"> => summaryDrafts[questionId ?? ""] ?? summaryDrafts["q-ai-major"];
