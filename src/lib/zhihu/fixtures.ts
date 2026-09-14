import type { HotResult, QuestionAnswersResult, QuestionsResult, QuotaResult, SearchResult } from "./types";

const questionUrl = "https://www.zhihu.com/question/1992917921941439400";
const questionTitle = "2026年，站在AI与人文的十字路口：00后如何定义自己的“新饭碗”与“新活法”？";

export function fixtureSearch(query: string, count: number): SearchResult {
  const items = [
    {
      title: questionTitle,
      contentType: "Question",
      contentId: "demo-crosspoint-ai-major",
      excerpt: `围绕“${query}”的公开检索演示结果：AI、工作意义、专业训练和真实就业处境需要被放在同一张讨论桌上。`,
      url: questionUrl,
      authorName: "CrossPoint Demo",
      voteUpCount: 128,
      commentCount: 36,
    },
    {
      title: "AI 时代，大学教育最难被替代的部分是什么？",
      contentType: "Question",
      contentId: "demo-crosspoint-education",
      excerpt: "演示数据：课程知识之外，方法训练、同伴网络和身份探索是否仍有独立价值？",
      url: "https://www.zhihu.com/question/625267321",
      authorName: "CrossPoint Demo",
      voteUpCount: 94,
      commentCount: 22,
    },
  ];
  return { hasMore: false, items: items.slice(0, count) };
}

export function fixtureHot(limit: number): HotResult {
  const items = [
    {
      title: questionTitle,
      url: questionUrl,
      thumbnailUrl: "",
      summary: "CrossPoint 公开检索演示议题，不表示实时知乎热榜排名。",
    },
    {
      title: "应届生应该优先积累通用能力还是行业经验？",
      url: "https://www.zhihu.com/question/651892024",
      thumbnailUrl: "",
      summary: "CrossPoint 演示议题，用于展示多视角匹配。",
    },
  ].slice(0, limit);
  return { total: items.length, items };
}

export function fixtureQuestions(query: string | undefined, count: number): QuestionsResult {
  const topic = query?.trim() || "你的兴趣画像";
  return {
    items: [
      { title: `${topic} · ${questionTitle}`, url: questionUrl },
      {
        title: "企业招聘正在降低对专业背景的要求吗？",
        url: "https://www.zhihu.com/question/629434019",
      },
      {
        title: "大学教育的目的应该由就业结果衡量吗？",
        url: "https://www.zhihu.com/question/614180825",
      },
    ].slice(0, count),
  };
}

export function fixtureQuestionAnswers(questionUrl: string, offset: number, limit: number): QuestionAnswersResult {
  const items = [
    {
      contentType: "Answer",
      contentToken: "demo-answer-education",
      url: `${questionUrl}#demo-answer-education`,
      summary: "演示摘要：AI 改变任务分工后，知识谱系、长期训练、同伴关系和工作意义仍需被重新组织。",
    },
    {
      contentType: "Answer",
      contentToken: "demo-answer-hiring",
      url: `${questionUrl}#demo-answer-hiring`,
      summary: "演示摘要：招聘可能减少部分履历硬门槛，同时更重视作品、情境任务、协作判断和真实能力证据。",
    },
  ];
  const page = items.slice(offset, offset + limit);
  const nextOffset = offset + page.length;
  return {
    items: page,
    paging: {
      isEnd: nextOffset >= items.length,
      ...(nextOffset < items.length ? { nextOffset } : {}),
      totals: items.length,
    },
  };
}

export function fixtureQuota(apiIds?: string[]): QuotaResult {
  const ids = apiIds?.length
    ? apiIds
    : ["global_search", "zhihu_search", "hot_list", "question_answers", "creator", "zhida_openai"];
  return {
    items: ids.map((apiId) => ({
      apiId,
      apiName: `${apiId}（演示额度）`,
      total: 0,
      used: 0,
      remaining: 0,
    })),
  };
}
