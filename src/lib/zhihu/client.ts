import { errorFromHttpStatus, errorFromUpstream, normalizeUnknownError, ZhihuError } from "./errors";
import type { UpstreamEnvelope } from "./types";

const API_ORIGIN = "https://developer.zhihu.com";

export type FetchLike = typeof fetch;

export class ZhihuHttpClient {
  constructor(
    private readonly accessSecret: string,
    private readonly timeoutMs: number,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async get<T>(path: string, query: Record<string, string | number | undefined>): Promise<T> {
    const url = new URL(path, API_ORIGIN);
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined) url.searchParams.set(key, String(value));
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.accessSecret}`,
          "X-Request-Timestamp": String(Math.floor(Date.now() / 1_000)),
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        cache: "no-store",
        signal: controller.signal,
      });

      let payload: UpstreamEnvelope<T>;
      try {
        payload = (await response.json()) as UpstreamEnvelope<T>;
      } catch {
        if (!response.ok) throw errorFromHttpStatus(response.status);
        throw new ZhihuError("INVALID_RESPONSE", "知乎接口返回了无法解析的响应。", 502, response.status);
      }

      const code = payload.Code ?? payload.code;
      if (!response.ok) {
        throw errorFromHttpStatus(response.status, payload.Message ?? payload.message, code);
      }
      if (code !== undefined && code !== 0 && code !== 20000) {
        throw errorFromUpstream(code, payload.Message ?? payload.message);
      }

      const data = payload.Data ?? payload.data;
      if (data === undefined) {
        throw new ZhihuError("INVALID_RESPONSE", "知乎接口响应缺少数据字段。", 502);
      }
      return data;
    } catch (error) {
      throw normalizeUnknownError(error);
    } finally {
      clearTimeout(timer);
    }
  }
}
