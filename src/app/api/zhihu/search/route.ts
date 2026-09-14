import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { routeFailure } from "@/lib/zhihu/route-response";
import { getZhihuService } from "@/lib/zhihu/service";

export const dynamic = "force-dynamic";

const schema = z.object({
  q: z.string().trim().min(1, "搜索词不能为空。").max(200, "搜索词不能超过 200 个字符。"),
  scope: z.enum(["zhihu", "global"]).default("zhihu"),
  count: z.coerce.number().int().min(1).max(20).default(6),
});

export async function GET(request: NextRequest) {
  try {
    const parsed = schema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const maxCount = parsed.scope === "zhihu" ? 10 : 20;
    const result = await getZhihuService().search(parsed.scope, parsed.q, Math.min(parsed.count, maxCount));
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return routeFailure(error);
  }
}
