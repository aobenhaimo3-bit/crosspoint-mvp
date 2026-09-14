import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { routeFailure } from "@/lib/zhihu/route-response";
import { getZhihuService } from "@/lib/zhihu/service";

export const dynamic = "force-dynamic";

const schema = z.object({
  q: z.string().trim().min(1, "主题不能是空白。").max(120).optional(),
  count: z.coerce.number().int().min(1).max(20).default(5),
});

export async function GET(request: NextRequest) {
  try {
    const parsed = schema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const result = await getZhihuService().questions(parsed.q, parsed.count);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return routeFailure(error);
  }
}
