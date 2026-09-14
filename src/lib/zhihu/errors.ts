import type { FallbackReason } from "./types";

export type ZhihuErrorCode =
  | "INVALID_REQUEST"
  | "AUTH_REQUIRED"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "UPSTREAM_ERROR"
  | "INVALID_RESPONSE"
  | "OAUTH_DISABLED"
  | "OAUTH_NOT_CONFIGURED"
  | "OAUTH_STATE_INVALID"
  | "OAUTH_CALLBACK_INVALID";

export class ZhihuError extends Error {
  constructor(
    public readonly code: ZhihuErrorCode,
    message: string,
    public readonly status = 502,
    public readonly upstreamCode?: number | string,
  ) {
    super(message);
    this.name = "ZhihuError";
  }
}

export function errorFromUpstream(code: number | undefined, message?: string): ZhihuError {
  if (code === 10001) return new ZhihuError("INVALID_REQUEST", "知乎接口拒绝了请求参数。", 400, code);
  if (code === 20001) return new ZhihuError("AUTH_REQUIRED", "知乎服务端凭据无效或已失效。", 503, code);
  if (code === 30001) return new ZhihuError("RATE_LIMITED", "知乎接口额度不足或请求过于频繁。", 429, code);
  return new ZhihuError("UPSTREAM_ERROR", message || "知乎上游服务暂时不可用。", 502, code);
}

export function errorFromHttpStatus(status: number, message?: string, upstreamCode?: number): ZhihuError {
  if (status === 400) return new ZhihuError("INVALID_REQUEST", "知乎接口拒绝了请求参数。", 400, upstreamCode ?? status);
  if (status === 401 || status === 403) return new ZhihuError("AUTH_REQUIRED", "知乎服务端凭据无效或已失效。", 503, upstreamCode ?? status);
  if (status === 429) return new ZhihuError("RATE_LIMITED", "知乎接口额度不足或请求过于频繁。", 429, upstreamCode ?? status);
  if (status === 408 || status === 504) return new ZhihuError("TIMEOUT", "知乎接口请求超时。", 504, upstreamCode ?? status);
  return new ZhihuError("UPSTREAM_ERROR", message || "知乎上游服务暂时不可用。", 502, upstreamCode ?? status);
}

export function normalizeUnknownError(error: unknown): ZhihuError {
  if (error instanceof ZhihuError) return error;
  if (error instanceof DOMException && error.name === "AbortError") {
    return new ZhihuError("TIMEOUT", "知乎接口请求超时。", 504);
  }
  if (error instanceof Error && error.name === "AbortError") {
    return new ZhihuError("TIMEOUT", "知乎接口请求超时。", 504);
  }
  return new ZhihuError("NETWORK_ERROR", "无法连接知乎上游服务。", 502);
}

export function fallbackReasonFor(error: ZhihuError): FallbackReason {
  switch (error.code) {
    case "AUTH_REQUIRED":
      return "authentication_failed";
    case "RATE_LIMITED":
      return "rate_limited";
    case "TIMEOUT":
      return "timeout";
    case "NETWORK_ERROR":
      return "network_error";
    default:
      return "upstream_error";
  }
}

export function publicError(error: unknown) {
  const normalized = normalizeUnknownError(error);
  return { code: normalized.code, message: normalized.message };
}
