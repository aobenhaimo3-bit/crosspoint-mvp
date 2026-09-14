import { TtlCache, sha256Input } from "./cache";
import { ZhihuHttpClient, type FetchLike } from "./client";
import { getZhihuConfig, type ZhihuConfig } from "./config";
import { fallbackReasonFor, normalizeUnknownError } from "./errors";
import { fixtureHot, fixtureQuestionAnswers, fixtureQuestions, fixtureQuota, fixtureSearch } from "./fixtures";
import type {
  FallbackReason,
  HotResult,
  QuestionAnswersResult,
  QuestionsResult,
  QuotaResult,
  SearchResult,
  ZhihuResult,
} from "./types";

type ApiId = "zhihu_search" | "global_search" | "hot_list" | "creator" | "question_answers";

interface RawSearchData {
  HasMore?: boolean;
  Items?: Array<Record<string, unknown>>;
}

interface RawHotData {
  Total?: number;
  Items?: Array<Record<string, unknown>>;
}

interface RawQuestionsData {
  Items?: Array<Record<string, unknown>>;
}

interface RawQuestionAnswersData {
  Items?: Array<Record<string, unknown>>;
  Paging?: Record<string, unknown>;
}

type RawQuotaData = Array<Record<string, unknown>>;

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function integer(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function mapSearch(data: RawSearchData): SearchResult {
  return {
    hasMore: Boolean(data.HasMore),
    items: (data.Items ?? []).map((item) => ({
      title: text(item.Title),
      contentType: text(item.ContentType),
      contentId: text(item.ContentID),
      excerpt: text(item.ContentText),
      url: text(item.Url),
      authorName: text(item.AuthorName) || "知乎用户",
      voteUpCount: integer(item.VoteUpCount),
      commentCount: integer(item.CommentCount),
    })),
  };
}

function mapHot(data: RawHotData): HotResult {
  const items = (data.Items ?? []).map((item) => ({
    title: text(item.Title),
    url: text(item.Url),
    thumbnailUrl: text(item.ThumbnailUrl),
    summary: text(item.Summary),
  }));
  return { total: integer(data.Total) || items.length, items };
}

function mapQuestions(data: RawQuestionsData): QuestionsResult {
  return {
    items: (data.Items ?? []).map((item) => ({ title: text(item.Title), url: text(item.Url) })),
  };
}

function optionalInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : undefined;
}

function mapQuestionAnswers(data: RawQuestionAnswersData): QuestionAnswersResult {
  const paging = data.Paging ?? {};
  return {
    items: (data.Items ?? []).map((item) => ({
      contentType: text(item.ContentType),
      contentToken: text(item.ContentToken),
      url: text(item.Url),
      summary: text(item.Summary),
    })),
    paging: {
      isEnd: Boolean(paging.IsEnd),
      ...(optionalInteger(paging.NextOffset) !== undefined ? { nextOffset: optionalInteger(paging.NextOffset) } : {}),
      ...(optionalInteger(paging.Totals) !== undefined ? { totals: optionalInteger(paging.Totals) } : {}),
    },
  };
}

function mapQuota(data: RawQuotaData): QuotaResult {
  return {
    items: data.map((item) => ({
      apiId: text(item.APIID),
      apiName: text(item.APIName),
      total: integer(item.TotalQuota),
      used: integer(item.TotalUsed),
      remaining: integer(item.RemainingQuota),
    })),
  };
}

export class ZhihuService {
  private readonly cache: TtlCache;
  private readonly client?: ZhihuHttpClient;
  private readonly knownQuota = new Map<string, number>();

  constructor(
    private readonly config: ZhihuConfig,
    fetchImpl: FetchLike = fetch,
    cache?: TtlCache,
  ) {
    this.cache = cache ?? new TtlCache(config.cacheTtlMs);
    if (config.accessSecret) this.client = new ZhihuHttpClient(config.accessSecret, config.timeoutMs, fetchImpl);
  }

  search(scope: "zhihu" | "global", query: string, count: number): Promise<ZhihuResult<SearchResult>> {
    const apiId: ApiId = scope === "zhihu" ? "zhihu_search" : "global_search";
    const path = `/api/v1/content/${apiId}`;
    return this.resolve(
      apiId,
      { scope, query, count },
      () => this.client!.get<RawSearchData>(path, { Query: query, Count: count }).then(mapSearch),
      () => fixtureSearch(query, count),
    );
  }

  hot(limit: number): Promise<ZhihuResult<HotResult>> {
    return this.resolve(
      "hot_list",
      { limit },
      () => this.client!.get<RawHotData>("/api/v1/content/hot_list", { Limit: limit }).then(mapHot),
      () => fixtureHot(limit),
    );
  }

  questions(query: string | undefined, count: number): Promise<ZhihuResult<QuestionsResult>> {
    return this.resolve(
      "creator",
      { query, count },
      () =>
        this.client!
          .get<RawQuestionsData>("/api/v1/user/question_recommendations", { Query: query, Count: count })
          .then(mapQuestions),
      () => fixtureQuestions(query, count),
    );
  }

  questionAnswers(questionUrl: string, offset: number, limit: number): Promise<ZhihuResult<QuestionAnswersResult>> {
    return this.resolve(
      "question_answers",
      { questionUrl, offset, limit },
      () => this.client!.get<RawQuestionAnswersData>("/api/v1/content/question_answers", {
        QuestionUrl: questionUrl,
        Offset: offset,
        Limit: limit,
      }).then(mapQuestionAnswers),
      () => fixtureQuestionAnswers(questionUrl, offset, limit),
    );
  }

  async quota(apiIds?: string[]): Promise<ZhihuResult<QuotaResult>> {
    const result = await this.resolve(
      "quota",
      { apiIds: apiIds ?? [] },
      () =>
        this.client!
          .get<RawQuotaData>("/api/v1/quota", { APIIDs: apiIds?.join(",") || undefined })
          .then(mapQuota),
      () => fixtureQuota(apiIds),
      true,
    );
    if (result.provenance.source === "zhihu_api") {
      result.data.items.forEach((item) => this.knownQuota.set(item.apiId, item.remaining));
    }
    return result;
  }

  private async resolve<T>(
    apiId: ApiId | "quota",
    input: unknown,
    live: () => Promise<T>,
    fixture: () => T,
    quotaEndpoint = false,
  ): Promise<ZhihuResult<T>> {
    const key = sha256Input(apiId, input);
    const cached = this.cache.get<ZhihuResult<T>>(key);
    if (cached) return { ...cached, provenance: { ...cached.provenance, cacheHit: true } };

    let fallbackReason: FallbackReason | undefined;
    if (!this.config.apiEnabled) fallbackReason = "api_disabled";
    else if (!this.client) fallbackReason = "missing_credentials";
    else if (!quotaEndpoint && this.knownQuota.get(apiId) === 0) fallbackReason = "quota_exhausted";

    let result: ZhihuResult<T>;
    if (fallbackReason) {
      result = this.fixtureResult(fixture(), fallbackReason);
    } else {
      try {
        result = {
          data: await live(),
          provenance: {
            source: "zhihu_api",
            label: "知乎开放平台只读接口",
            fetchedAt: new Date().toISOString(),
            cacheHit: false,
          },
        };
      } catch (error) {
        const normalized = normalizeUnknownError(error);
        result = this.fixtureResult(fixture(), fallbackReasonFor(normalized));
      }
    }
    this.cache.set(key, result);
    return result;
  }

  private fixtureResult<T>(data: T, fallbackReason: FallbackReason): ZhihuResult<T> {
    return {
      data,
      provenance: {
        source: "demo_fixture",
        label: "CrossPoint Demo/Test Fixture（非实时知乎内容）",
        fetchedAt: new Date().toISOString(),
        cacheHit: false,
        fallbackReason,
      },
    };
  }
}

let singleton: ZhihuService | undefined;

export function getZhihuService(): ZhihuService {
  singleton ??= new ZhihuService(getZhihuConfig());
  return singleton;
}
