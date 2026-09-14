import type { NextRequest } from "next/server";
import { getSafeSessionUser, OAUTH_SESSION_COOKIE } from "@/lib/zhihu/oauth";
import { demoEnabled, getDemoSessionSecret, tokenFromRequest, verifyDemoSessionToken } from "@/server/demo-session";
import { ScenarioError } from "@/server/errors";

export type ScenarioActor = {
  userId: string;
  authMode: "demo" | "formal";
  scenarioId?: string;
};

/** Authentication adapter boundary shared by every scenario route. */
export function resolveScenarioActor(request: NextRequest): ScenarioActor {
  if (demoEnabled()) {
    const claims = verifyDemoSessionToken(tokenFromRequest(request), getDemoSessionSecret());
    return { userId: claims.personaId, scenarioId: claims.scenarioId, authMode: "demo" };
  }

  const sessionId = request.cookies.get(OAUTH_SESSION_COOKIE)?.value;
  const user = getSafeSessionUser(sessionId);
  const userId = user?.uid ?? user?.hashId;
  if (!userId) throw new ScenarioError("SESSION_REQUIRED", "A formal CrossPoint session is required.", 401);
  return { userId, authMode: "formal" };
}
