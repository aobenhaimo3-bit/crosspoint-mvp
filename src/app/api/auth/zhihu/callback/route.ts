import { NextRequest, NextResponse } from "next/server";
import { getZhihuOAuthConfig, missingOAuthConfig } from "@/lib/zhihu/config";
import { publicError, ZhihuError } from "@/lib/zhihu/errors";
import {
  createServerSession,
  exchangeAuthorizationCode,
  fetchAuthorizedUser,
  OAUTH_SESSION_COOKIE,
  OAUTH_STATE_COOKIE,
  validateAndConsumeOAuthState,
} from "@/lib/zhihu/oauth";

export const dynamic = "force-dynamic";

function clearState(response: NextResponse): NextResponse {
  response.cookies.set(OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth/zhihu/callback",
    maxAge: 0,
  });
  return response;
}

export async function GET(request: NextRequest) {
  const config = getZhihuOAuthConfig();
  const missing = missingOAuthConfig(config);
  if (!config.enabled || missing.length) {
    return clearState(
      NextResponse.json(
        {
          ok: false,
          error: {
            code: config.enabled ? "OAUTH_NOT_CONFIGURED" : "OAUTH_DISABLED",
            message: config.enabled ? "知乎 OAuth 缺少服务端配置。" : "知乎 OAuth 尚未启用。",
            ...(missing.length ? { missing } : {}),
          },
        },
        { status: 503 },
      ),
    );
  }

  try {
    const state = request.nextUrl.searchParams.get("state");
    validateAndConsumeOAuthState(request.cookies.get(OAUTH_STATE_COOKIE)?.value, state, config.appKey!);
    const code =
      request.nextUrl.searchParams.get("authorization_code") ?? request.nextUrl.searchParams.get("code");
    if (!code) throw new ZhihuError("OAUTH_CALLBACK_INVALID", "知乎回调缺少授权码。", 400);

    const oauthConfig = {
      appId: config.appId!,
      appKey: config.appKey!,
      redirectUri: config.redirectUri!,
      timeoutMs: config.timeoutMs,
    };
    const token = await exchangeAuthorizationCode(oauthConfig, code);
    const user = await fetchAuthorizedUser(token.accessToken, config.timeoutMs);
    const sessionId = createServerSession(token.accessToken, token.expiresIn, user);
    // Redirect only to the pre-registered application origin, never a caller-controlled Host header.
    const response = NextResponse.redirect(new URL("/?oauth=success", config.redirectUri!));
    response.cookies.set(OAUTH_SESSION_COOKIE, sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: token.expiresIn,
    });
    response.headers.set("Cache-Control", "no-store");
    return clearState(response);
  } catch (error) {
    const normalized = publicError(error);
    const status = error instanceof ZhihuError ? error.status : 502;
    return clearState(NextResponse.json({ ok: false, error: normalized }, { status }));
  }
}
