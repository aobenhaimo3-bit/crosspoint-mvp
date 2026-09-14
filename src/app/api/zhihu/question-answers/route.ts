import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { routeFailure } from "@/lib/zhihu/route-response";
import { getZhihuService } from "@/lib/zhihu/service";

export const dynamic = "force-dynamic";

const questionUrl = z.string().url("问题链接格式无效。").refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" &&
    (url.hostname === "www.zhihu.com" || url.hostname === "zhihu.com") &&
    /^\/question\/\d+\/?$/.test(url.pathname);
}, "只接受知乎问题链接。");

const schema = z.object({
  url: questionUrl,
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export async function GET(request: NextRequest) {
  try {
    const parsed = schema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const result = await getZhihuService().questionAnswers(parsed.url, parsed.offset, parsed.limit);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return routeFailure(error);
  }
}
