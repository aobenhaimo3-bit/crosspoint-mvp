import { NextRequest, NextResponse } from "next/server";
import { getSafeSessionUser, OAUTH_SESSION_COOKIE } from "@/lib/zhihu/oauth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = getSafeSessionUser(request.cookies.get(OAUTH_SESSION_COOKIE)?.value);
  if (!user) {
    return NextResponse.json(
      { ok: false, error: { code: "SESSION_NOT_FOUND", message: "当前没有有效的知乎登录会话。" } },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json({ ok: true, user }, { headers: { "Cache-Control": "no-store" } });
}
