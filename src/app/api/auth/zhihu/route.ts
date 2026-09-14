import { NextResponse } from "next/server";
import { getZhihuOAuthConfig, missingOAuthConfig } from "@/lib/zhihu/config";
import {
  buildAuthorizationUrl,
  createOAuthState,
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_MAX_AGE_SECONDS,
} from "@/lib/zhihu/oauth";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = getZhihuOAuthConfig();
  if (!config.enabled) {
    return NextResponse.json(
      { ok: false, error: { code: "OAUTH_DISABLED", message: "知乎 OAuth 尚未启用；Demo 登录仍可使用。" } },
      { status: 503 },
    );
  }
  const missing = missingOAuthConfig(config);
  if (missing.length) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "OAUTH_NOT_CONFIGURED", message: "知乎 OAuth 缺少服务端配置。", missing },
      },
      { status: 503 },
    );
  }

  const { state, cookieValue } = createOAuthState(config.appKey!);
  const response = NextResponse.redirect(buildAuthorizationUrl({ appId: config.appId!, redirectUri: config.redirectUri! }, state));
  response.cookies.set(OAUTH_STATE_COOKIE, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth/zhihu/callback",
    maxAge: OAUTH_STATE_MAX_AGE_SECONDS,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
