import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { DEMO_SCENARIO_ID, canonicalDemoProfiles } from "@/data/demo";
import { createDemoSessionToken, demoEnabled, getDemoSessionSecret, tokenFromRequest, verifyDemoSessionToken } from "@/server/demo-session";
import { ScenarioError } from "@/server/errors";
import { scenarioFailure } from "@/server/http";
import { getScenarioService } from "@/server/scenario";

export const dynamic = "force-dynamic";
const personaIds = canonicalDemoProfiles.map((profile) => profile.id);
const schema = z.object({ scenarioId: z.string().min(1).optional(), personaId: z.string().min(1).optional() });

export async function GET(request: NextRequest) {
  if (!demoEnabled()) return NextResponse.json({ ok: true, demoEnabled: false }, { headers: { "Cache-Control": "no-store" } });
  try {
    const secret = getDemoSessionSecret();
    let token: string;
    try { token = tokenFromRequest(request); }
    catch { return NextResponse.json({ ok: true, demoEnabled: true }, { headers: { "Cache-Control": "no-store" } }); }
    const claims = verifyDemoSessionToken(token, secret);
    const state = getScenarioService().getView(claims.scenarioId, claims.personaId);
    return NextResponse.json({ ok: true, demoEnabled: true, session: claims, state }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return scenarioFailure(error); }
}

export async function POST(request: NextRequest) {
  try {
    const secret = getDemoSessionSecret();
    const parsed = schema.parse(await request.json().catch(() => ({})));
    let existingSession: ReturnType<typeof verifyDemoSessionToken> | undefined;
    try { existingSession = verifyDemoSessionToken(tokenFromRequest(request), secret); }
    catch (error) { if (!(error instanceof ScenarioError) || error.code !== "SESSION_REQUIRED") throw error; }
    const existingScenarioId = existingSession?.scenarioId;
    const scenarioId = parsed.scenarioId ?? existingScenarioId ?? DEMO_SCENARIO_ID;
    if (scenarioId !== DEMO_SCENARIO_ID || (existingScenarioId && existingScenarioId !== scenarioId)) throw new ScenarioError("SCENARIO_FORBIDDEN", "Demo sessions cannot switch scenarios.", 403);
    const personaId = parsed.personaId ?? existingSession?.personaId ?? canonicalDemoProfiles[0].id;
    if (!personaIds.includes(personaId)) throw new ScenarioError("NOT_MEMBER", "Unknown Demo identity.", 403);
    const service = getScenarioService();
    service.ensureDemoScenario(scenarioId);
    const created = createDemoSessionToken({ scenarioId, personaId }, secret);
    const state = service.getView(scenarioId, personaId);
    return NextResponse.json({ ok: true, demoEnabled: true, sessionToken: created.token, session: created.claims, state }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return scenarioFailure(error); }
}
