import { describe, expect, it, vi } from "vitest";
import type { FetchLike } from "./client";
import { ZhihuService } from "./service";

const fakeAccessCredential = ["test", "only", "credential"].join("-");
const baseConfig = {
  apiEnabled: true,
  accessSecret: fakeAccessCredential,
  timeoutMs: 1_000,
  cacheTtlMs: 60_000,
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("ZhihuService", () => {
  it("uses clearly labelled fixtures while API access is disabled", async () => {
    const fetchMock = vi.fn();
    const service = new ZhihuService({ ...baseConfig, apiEnabled: false }, fetchMock as unknown as FetchLike);
    const result = await service.search("zhihu", "AI 专业", 2);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.provenance).toMatchObject({ source: "demo_fixture", fallbackReason: "api_disabled" });
    expect(result.provenance.label).toContain("非实时知乎内容");
  });

  it("normalizes live data and serves a SHA-keyed cache hit", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      void _input;
      void _init;
      return response({
        Code: 0,
        Message: "success",
        Data: {
          HasMore: false,
          Items: [
            {
              Title: "测试标题",
              ContentType: "Answer",
              ContentID: "1",
              ContentText: "摘要",
              Url: "https://www.zhihu.com/answer/1",
              AuthorName: "作者",
              VoteUpCount: 3,
              CommentCount: 2,
            },
          ],
        },
      });
    });
    const service = new ZhihuService(baseConfig, fetchMock as unknown as FetchLike);
    const first = await service.search("zhihu", "测试", 1);
    const second = await service.search("zhihu", "测试", 1);
    expect(first.provenance.source).toBe("zhihu_api");
    expect(first.data.items[0]?.excerpt).toBe("摘要");
    expect(second.provenance.cacheHit).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const headers = (fetchMock.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${fakeAccessCredential}`);
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("falls back without retrying after an upstream quota error", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      void _input;
      void _init;
      return response({ Code: 30001, Message: "rate limit" });
    });
    const service = new ZhihuService(baseConfig, fetchMock as unknown as FetchLike);
    const result = await service.hot(5);
    expect(result.provenance).toMatchObject({ source: "demo_fixture", fallbackReason: "rate_limited" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses a cached zero quota to skip the affected live capability", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          Code: 0,
          Data: [{ APIID: "hot_list", APIName: "热榜", TotalQuota: 10, TotalUsed: 10, RemainingQuota: 0 }],
        }),
      );
    const service = new ZhihuService(baseConfig, fetchMock as unknown as FetchLike);
    expect((await service.quota(["hot_list"])).provenance.source).toBe("zhihu_api");
    const hot = await service.hot(5);
    expect(hot.provenance.fallbackReason).toBe("quota_exhausted");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("normalizes and caches question answer summaries with opaque next offsets", async () => {
    const fetchMock = vi.fn(async () => response({
      Code: 0,
      Data: {
        Items: [{ ContentType: "Answer", ContentToken: "a-1", Url: "https://www.zhihu.com/answer/1", Summary: "服务端摘要" }],
        Paging: { IsEnd: false, NextOffset: 37, Totals: 80 },
      },
    }));
    const service = new ZhihuService(baseConfig, fetchMock as unknown as FetchLike);
    const first = await service.questionAnswers("https://www.zhihu.com/question/123", 0, 20);
    const second = await service.questionAnswers("https://www.zhihu.com/question/123", 0, 20);
    expect(first.data).toMatchObject({
      items: [{ contentToken: "a-1", summary: "服务端摘要" }],
      paging: { isEnd: false, nextOffset: 37, totals: 80 },
    });
    expect(second.provenance.cacheHit).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    [401, "authentication_failed"],
    [403, "authentication_failed"],
    [429, "rate_limited"],
    [504, "timeout"],
  ] as const)("maps HTTP %s without an envelope code to %s", async (status, fallbackReason) => {
    const fetchMock = vi.fn(async () => response({ Message: "request failed" }, status));
    const service = new ZhihuService(baseConfig, fetchMock as unknown as FetchLike);
    const result = await service.hot(5);
    expect(result.provenance).toMatchObject({ source: "demo_fixture", fallbackReason });
  });
});
