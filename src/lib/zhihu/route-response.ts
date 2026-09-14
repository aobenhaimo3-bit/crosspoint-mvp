import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { publicError, ZhihuError } from "./errors";

export function routeFailure(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    return NextResponse.json(
      { ok: false, error: { code: "INVALID_REQUEST", message: error.issues[0]?.message ?? "请求参数无效。" } },
      { status: 400 },
    );
  }
  return NextResponse.json(
    { ok: false, error: publicError(error) },
    { status: error instanceof ZhihuError ? error.status : 502 },
  );
}
