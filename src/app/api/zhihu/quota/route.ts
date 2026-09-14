import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { routeFailure } from "@/lib/zhihu/route-response";
import { getZhihuService } from "@/lib/zhihu/service";

export const dynamic = "force-dynamic";

const allowed = [
  "global_search",
  "zhihu_search",
  "hot_list",
  "question_answers",
  "user_data",
  "creator",
  "zhida_openai",
  "knowledge",
  "tools",
] as const;
const apiIdSchema = z.enum(allowed);

export async function GET(request: NextRequest) {
  try {
    const raw = request.nextUrl.searchParams.getAll("apiId").flatMap((value) => value.split(","));
    const apiIds = raw.length ? z.array(apiIdSchema).max(9).parse(raw) : undefined;
    const result = await getZhihuService().quota(apiIds);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return routeFailure(error);
  }
}
