export type ZhihuDataSource = "zhihu_api" | "demo_fixture";

export type FallbackReason =
  | "api_disabled"
  | "missing_credentials"
  | "quota_exhausted"
  | "rate_limited"
  | "timeout"
  | "network_error"
  | "upstream_error"
  | "authentication_failed";

export interface Provenance {
  source: ZhihuDataSource;
  label: string;
  fetchedAt: string;
  cacheHit: boolean;
  fallbackReason?: FallbackReason;
}

export interface ZhihuResult<T> {
  data: T;
  provenance: Provenance;
}

export interface SearchItem {
  title: string;
  contentType: string;
  contentId: string;
  excerpt: string;
  url: string;
  authorName: string;
  voteUpCount: number;
  commentCount: number;
}

export interface SearchResult {
  hasMore: boolean;
  items: SearchItem[];
}

export interface HotItem {
  title: string;
  url: string;
  thumbnailUrl: string;
  summary: string;
}

export interface HotResult {
  total: number;
  items: HotItem[];
}

export interface RecommendedQuestion {
  title: string;
  url: string;
}

export interface QuestionsResult {
  items: RecommendedQuestion[];
}

export interface QuestionAnswerItem {
  contentType: string;
  contentToken: string;
  url: string;
  summary: string;
}

export interface QuestionAnswersResult {
  items: QuestionAnswerItem[];
  paging: {
    isEnd: boolean;
    nextOffset?: number;
    totals?: number;
  };
}

export interface QuotaItem {
  apiId: string;
  apiName: string;
  total: number;
  used: number;
  remaining: number;
}

export interface QuotaResult {
  items: QuotaItem[];
}

export interface UpstreamEnvelope<T> {
  Code?: number;
  Message?: string;
  Data?: T;
  code?: number;
  message?: string;
  data?: T;
}

export interface SafeZhihuUser {
  uid?: string;
  hashId?: string;
  fullName: string;
  headline?: string;
  description?: string;
  avatarUrl?: string;
  profileUrl?: string;
}
