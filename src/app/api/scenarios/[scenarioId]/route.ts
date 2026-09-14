import { NextRequest, NextResponse } from "next/server";
import { resolveScenarioActor } from "@/server/auth";
import { ScenarioError } from "@/server/errors";
import { scenarioFailure } from "@/server/http";
import { getScenarioService } from "@/server/scenario";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ scenarioId: string }> }) {
  try {
    const { scenarioId } = await context.params;
    const actor = resolveScenarioActor(request);
    if (actor.scenarioId && actor.scenarioId !== scenarioId) throw new ScenarioError("SCENARIO_FORBIDDEN", "Session does not belong to this scenario.", 403);
    return NextResponse.json({ ok: true, state: getScenarioService().getView(scenarioId, actor.userId) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return scenarioFailure(error); }
}
