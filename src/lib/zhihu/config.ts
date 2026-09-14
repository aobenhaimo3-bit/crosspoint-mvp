export interface ZhihuConfig {
  apiEnabled: boolean;
  accessSecret?: string;
  timeoutMs: number;
  cacheTtlMs: number;
}

export interface ZhihuOAuthConfig {
  enabled: boolean;
  appId?: string;
  appKey?: string;
  redirectUri?: string;
  timeoutMs: number;
}

function integerEnv(name: string, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

export function getZhihuConfig(): ZhihuConfig {
  return {
    apiEnabled: process.env.ZHIHU_API_ENABLED === "true",
    accessSecret: process.env.ZHIHU_ACCESS_SECRET || undefined,
    timeoutMs: integerEnv("ZHIHU_API_TIMEOUT_MS", 8_000, 1_000, 30_000),
    cacheTtlMs: integerEnv("ZHIHU_CACHE_TTL_SECONDS", 900, 30, 86_400) * 1_000,
  };
}

export function getZhihuOAuthConfig(): ZhihuOAuthConfig {
  return {
    enabled: process.env.ZHIHU_OAUTH_ENABLED === "true",
    appId: process.env.ZHIHU_OAUTH_APP_ID || undefined,
    appKey: process.env.ZHIHU_OAUTH_APP_KEY || undefined,
    redirectUri: process.env.ZHIHU_OAUTH_REDIRECT_URI || undefined,
    timeoutMs: integerEnv("ZHIHU_API_TIMEOUT_MS", 8_000, 1_000, 30_000),
  };
}

export function missingOAuthConfig(config: ZhihuOAuthConfig): string[] {
  const missing: string[] = [];
  if (!config.appId) missing.push("ZHIHU_OAUTH_APP_ID");
  if (!config.appKey) missing.push("ZHIHU_OAUTH_APP_KEY");
  if (!config.redirectUri) missing.push("ZHIHU_OAUTH_REDIRECT_URI");
  return missing;
}
