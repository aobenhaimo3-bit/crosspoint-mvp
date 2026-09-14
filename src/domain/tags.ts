import type { StandardTag, TagId } from "./models";

const tag = (
  id: TagId,
  label: string,
  category: StandardTag["category"],
  aliases: readonly string[] = [],
): StandardTag => ({ id, label, category, aliases, active: true });

/** Canonical MVP vocabulary. Free text must map to one of these IDs and be confirmed. */
export const STANDARD_TAGS = [
  // 科技与工程
  tag("topic.ai", "人工智能", "topic", ["AI", "大模型"]),
  tag("topic.software_development", "编程与软件开发", "topic", ["编程", "软件开发"]),
  tag("topic.data_science", "数据科学", "topic"),
  tag("topic.cybersecurity", "网络安全", "topic"),
  tag("topic.robotics", "机器人与智能硬件", "topic", ["机器人", "智能硬件"]),
  tag("topic.internet_platforms", "互联网与平台", "topic", ["互联网平台"]),
  tag("topic.product_design", "产品与交互", "topic", ["产品设计", "交互设计"]),
  tag("topic.open_source", "开源与开发者生态", "topic", ["开源", "开发者生态"]),
  // 商业与产业
  tag("topic.business_models", "商业模式", "topic"),
  tag("topic.organization_management", "组织管理", "topic"),
  tag("topic.entrepreneurship", "创业创新", "topic", ["创业"]),
  tag("topic.marketing", "市场营销", "topic"),
  tag("topic.financial_markets", "金融市场", "topic"),
  tag("topic.industry_trends", "产业趋势", "topic"),
  tag("topic.consumer_brands", "消费与品牌", "topic", ["消费趋势", "品牌"]),
  tag("topic.digital_transformation", "企业数字化", "topic", ["数字化转型"]),
  // 教育与成长
  tag("topic.education", "教育", "topic", ["高校教育"]),
  tag("topic.university", "大学与专业", "topic"),
  tag("topic.learning_methods", "学习方法", "topic"),
  tag("topic.talent_development", "人才培养", "topic"),
  tag("topic.digital_education", "数字教育", "topic", ["在线教育", "教育科技"]),
  tag("topic.education_equity", "教育公平", "topic"),
  tag("topic.vocational_education", "职业教育", "topic"),
  tag("topic.youth_development", "青年成长", "topic"),
  // 职业与劳动
  tag("topic.employment", "就业", "topic", ["求职"]),
  tag("topic.career", "职业发展", "topic"),
  tag("topic.skills", "技能迁移", "topic"),
  tag("topic.future_work", "未来工作", "topic"),
  tag("topic.recruiting", "招聘与选才", "topic", ["招聘", "人才选拔"]),
  tag("topic.workplace_culture", "职场文化", "topic"),
  tag("topic.labor_relations", "劳动关系", "topic"),
  tag("topic.flexible_work", "灵活就业", "topic", ["自由职业", "零工经济"]),
  // 社会与公共
  tag("topic.public_policy", "公共政策", "topic"),
  tag("topic.law_governance", "法律与治理", "topic", ["法律", "社会治理"]),
  tag("topic.social_structure", "社会结构", "topic"),
  tag("topic.urban_rural", "城乡与区域", "topic", ["城乡发展", "区域发展"]),
  tag("topic.demographics", "人口与代际", "topic", ["人口", "代际"]),
  tag("topic.social_security", "社会保障", "topic"),
  tag("topic.media_discourse", "媒体与舆论", "topic", ["媒体", "公共舆论"]),
  tag("topic.platform_governance", "平台治理", "topic"),
  // 人文与价值
  tag("topic.philosophy", "哲学思辨", "topic", ["哲学思考"]),
  tag("topic.tech_ethics", "科技伦理", "topic", ["技术伦理"]),
  tag("topic.psychology_wellbeing", "心理与幸福", "topic", ["幸福感"]),
  tag("topic.culture_identity", "文化与身份", "topic", ["文化认同"]),
  tag("topic.history", "历史观察", "topic"),
  tag("topic.literature", "文学与表达", "topic", ["文学"]),
  tag("topic.arts", "艺术与审美", "topic", ["艺术", "审美"]),
  tag("topic.meaning_of_life", "生命与意义", "topic", ["人生意义"]),
  tag("expertise.software", "软件工程", "expertise"),
  tag("expertise.machine_learning", "机器学习", "expertise"),
  tag("expertise.finance", "金融", "expertise"),
  tag("expertise.recruiting", "招聘与人才评估", "expertise", ["招聘与人才筛选", "校招面试", "人才筛选"]),
  tag("expertise.pedagogy", "教育学", "expertise"),
  tag("expertise.product", "产品管理", "expertise"),
  tag("expertise.labor_market", "劳动力市场", "expertise"),
  tag("expertise.business", "商业与组织", "expertise", ["商科"]),
  tag("expertise.philosophy", "哲学与伦理", "expertise", ["哲学", "科技伦理"]),
  tag("expertise.sociology", "社会学", "expertise", ["社会研究"]),
  tag("experience.student", "在读学生", "experience"),
  tag("experience.campus_recruiting", "校招经历", "experience"),
  tag("experience.teaching", "教学经历", "experience"),
  tag("experience.ai_delivery", "AI 项目落地", "experience"),
  tag("experience.career_switch", "转行经历", "experience"),
  tag("experience.management", "团队管理", "experience"),
  tag("role.student", "学生", "role"),
  tag("role.engineer", "工程师", "role"),
  tag("role.recruiter", "招聘者", "role"),
  tag("role.teacher", "教师", "role"),
  tag("role.researcher", "研究者", "role"),
  tag("role.product", "AI 产品从业者", "role"),
  tag("role.employer", "用人方", "role"),
  tag("perspective.learner", "学习者视角", "perspective"),
  tag("perspective.technical", "技术实践视角", "perspective"),
  tag("perspective.employer", "雇主与招聘视角", "perspective"),
  tag("perspective.education", "教育设计视角", "perspective"),
  tag("perspective.industry", "行业落地视角", "perspective"),
  tag("perspective.equity", "机会公平视角", "perspective"),
  tag("perspective.long_term", "长期职业视角", "perspective"),
  tag("perspective.business", "商业与组织视角", "perspective"),
  tag("perspective.philosophy", "人文与伦理视角", "perspective"),
  tag("perspective.society", "社会结构视角", "perspective"),
  tag("evidence.personal", "个人经历", "evidence"),
  tag("evidence.case_study", "案例研究", "evidence"),
  tag("evidence.data", "数据分析", "evidence"),
  tag("evidence.research", "学术研究", "evidence"),
  tag("evidence.hiring", "招聘一线观察", "evidence"),
  tag("evidence.product", "产品实践", "evidence"),
  tag("evidence.curriculum", "课程与教学观察", "evidence"),
  tag("evidence.market", "市场与行业观察", "evidence"),
] as const satisfies readonly StandardTag[];

export const STANDARD_TAG_BY_ID: ReadonlyMap<TagId, StandardTag> = new Map(
  STANDARD_TAGS.map((item) => [item.id, item]),
);

export function isStandardTagId(id: string): boolean {
  return STANDARD_TAG_BY_ID.has(id);
}

export function mapFreeTextToStandardTags(input: string): readonly StandardTag[] {
  const normalize = (value: string) =>
    value.normalize("NFKC").toLocaleLowerCase("zh-CN").replace(/[\s\p{P}\p{S}]+/gu, "");
  const normalized = normalize(input);
  if (!normalized) return [];
  return STANDARD_TAGS.filter((item) =>
    [item.label, ...item.aliases].some((value) =>
      normalize(value).includes(normalized) || normalized.includes(normalize(value)),
    ),
  );
}
