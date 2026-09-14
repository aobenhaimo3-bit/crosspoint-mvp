import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { ZhihuError, normalizeUnknownError } from "./errors";
import type { FetchLike } from "./client";
import type { SafeZhihuUser } from "./types";
import type { ZhihuOAuthConfig } from "./config";

export const OAUTH_STATE_COOKIE = "crosspoint_zhihu_oauth_state";
export const OAUTH_SESSION_COOKIE = "crosspoint_zhihu_session";
export const OAUTH_STATE_MAX_AGE_SECONDS = 10 * 60;

interface StatePayload {
  state: string;
  issuedAt: number;
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  token_type?: string;
  code?: number;
  message?: string;
}

interface SessionRecord {
  accessToken: string;
  expiresAt: number;
  user: SafeZhihuUser;
}

const consumedStates = new Map<string, number>();
const sessions = new Map<string, SessionRecord>();

function base64url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function sign(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function equalSecret(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function prune(now: number): void {
  consumedStates.forEach((expiresAt, key) => {
    if (expiresAt <= now) consumedStates.delete(key);
  });
  sessions.forEach((session, key) => {
    if (session.expiresAt <= now) sessions.delete(key);
  });
}

export function createOAuthState(appKey: string, now = Date.now()): { state: string; cookieValue: string } {
  const payload: StatePayload = {
    state: randomBytes(32).toString("base64url"),
    issuedAt: now,
  };
  const encoded = base64url(JSON.stringify(payload));
  return { state: payload.state, cookieValue: `${encoded}.${sign(encoded, appKey)}` };
}

export function validateAndConsumeOAuthState(
  cookieValue: string | undefined,
  returnedState: string | null,
  appKey: string,
  now = Date.now(),
): void {
  prune(now);
  if (!cookieValue || !returnedState) {
    throw new ZhihuError("OAUTH_STATE_INVALID", "知乎登录请求已过期或缺少 state。", 400);
  }
  const [encoded, signature, extra] = cookieValue.split(".");
  if (!encoded || !signature || extra || !equalSecret(signature, sign(encoded, appKey))) {
    throw new ZhihuError("OAUTH_STATE_INVALID", "知乎登录 state 签名无效。", 400);
  }

  let payload: StatePayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as StatePayload;
  } catch {
    throw new ZhihuError("OAUTH_STATE_INVALID", "知乎登录 state 无法解析。", 400);
  }

  const age = now - payload.issuedAt;
  if (age < 0 || age > OAUTH_STATE_MAX_AGE_SECONDS * 1_000 || !equalSecret(payload.state, returnedState)) {
    throw new ZhihuError("OAUTH_STATE_INVALID", "知乎登录 state 不匹配或已过期。", 400);
  }
  const replayKey = sign(payload.state, appKey);
  if (consumedStates.has(replayKey)) {
    throw new ZhihuError("OAUTH_STATE_INVALID", "知乎登录请求已被使用。", 400);
  }
  consumedStates.set(replayKey, now + OAUTH_STATE_MAX_AGE_SECONDS * 1_000);
}

export function buildAuthorizationUrl(config: Required<Pick<ZhihuOAuthConfig, "appId" | "redirectUri">>, state: string) {
  const url = new URL("https://openapi.zhihu.com/authorize");
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("app_id", config.appId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  return url;
}

async function timedFetch(fetchImpl: FetchLike, url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal, cache: "no-store" });
  } catch (error) {
    throw normalizeUnknownError(error);
  } finally {
    clearTimeout(timer);
  }
}

export async function exchangeAuthorizationCode(
  config: Required<Pick<ZhihuOAuthConfig, "appId" | "appKey" | "redirectUri" | "timeoutMs">>,
  code: string,
  fetchImpl: FetchLike = fetch,
): Promise<{ accessToken: string; expiresIn: number }> {
  const body = new URLSearchParams({
    app_id: config.appId,
    app_key: config.appKey,
    grant_type: "authorization_code",
    redirect_uri: config.redirectUri,
    code,
  });
  const response = await timedFetch(
    fetchImpl,
    "https://openapi.zhihu.com/access_token",
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body },
    config.timeoutMs,
  );
  const payload = (await response.json().catch(() => null)) as TokenResponse | null;
  if (!response.ok || !payload?.access_token) {
    throw new ZhihuError("OAUTH_CALLBACK_INVALID", "知乎授权码交换失败。", 502, payload?.code ?? response.status);
  }
  return { accessToken: payload.access_token, expiresIn: Math.max(60, payload.expires_in ?? 3_600) };
}

function parseProfileJson(raw: string): Record<string, unknown> {
  // uid may exceed Number.MAX_SAFE_INTEGER. Convert that single documented int64 field before JSON.parse.
  const lossless = raw.replace(/("uid"\s*:\s*)(-?\d+)/, '$1"$2"');
  try {
    return JSON.parse(lossless) as Record<string, unknown>;
  } catch {
    throw new ZhihuError("INVALID_RESPONSE", "知乎用户信息响应无法解析。", 502);
  }
}

export async function fetchAuthorizedUser(
  accessToken: string,
  timeoutMs: number,
  fetchImpl: FetchLike = fetch,
): Promise<SafeZhihuUser> {
  const response = await timedFetch(
    fetchImpl,
    "https://openapi.zhihu.com/user",
    { method: "GET", headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } },
    timeoutMs,
  );
  const payload = parseProfileJson(await response.text());
  const nested = payload.data && typeof payload.data === "object" ? (payload.data as Record<string, unknown>) : payload;
  const uid = typeof nested.uid === "string" ? nested.uid : undefined;
  const hashId = typeof nested.hash_id === "string" ? nested.hash_id : undefined;
  const fullName = typeof nested.fullname === "string" ? nested.fullname : "";
  if (!response.ok || (!uid && !hashId) || !fullName) {
    throw new ZhihuError("OAUTH_CALLBACK_INVALID", "知乎用户信息校验失败。", 502);
  }
  return {
    uid,
    hashId,
    fullName,
    headline: typeof nested.headline === "string" ? nested.headline : undefined,
    description: typeof nested.description === "string" ? nested.description : undefined,
    avatarUrl: typeof nested.avatar_path === "string" ? nested.avatar_path : undefined,
    profileUrl: typeof nested.url === "string" ? nested.url : undefined,
  };
}

export function createServerSession(accessToken: string, expiresIn: number, user: SafeZhihuUser, now = Date.now()): string {
  prune(now);
  const sessionId = randomBytes(32).toString("base64url");
  sessions.set(sessionId, { accessToken, expiresAt: now + expiresIn * 1_000, user });
  return sessionId;
}

export function getSafeSessionUser(sessionId: string | undefined, now = Date.now()): SafeZhihuUser | undefined {
  prune(now);
  return sessionId ? sessions.get(sessionId)?.user : undefined;
}
