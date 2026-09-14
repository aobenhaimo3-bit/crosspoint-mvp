import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { routeFailure } from "@/lib/zhihu/route-response";
import { getZhihuService } from "@/lib/zhihu/service";

export const dynamic = "force-dynamic";

const schema = z.object({ limit: z.coerce.number().int().min(1).max(30).default(10) });

export async function GET(request: NextRequest) {
  try {
    const { limit } = schema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const result = await getZhihuService().hot(limit);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return routeFailure(error);
  }
}
