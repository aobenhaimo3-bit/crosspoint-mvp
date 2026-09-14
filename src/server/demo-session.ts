import { createHmac, timingSafeEqual } from "node:crypto";
import { ScenarioError } from "./errors";

export interface DemoSessionClaims {
  scenarioId: string;
  personaId: string;
  issuedAt: number;
  expiresAt: number;
}

const encode = (value: string) => Buffer.from(value, "utf8").toString("base64url");
const sign = (payload: string, secret: string) => createHmac("sha256", secret).update(payload).digest("base64url");

export function demoEnabled(): boolean {
  return process.env.DEMO_MODE === "true";
}

export function getDemoSessionSecret(): string {
  if (!demoEnabled()) throw new ScenarioError("DEMO_DISABLED", "Demo sessions are disabled.", 503);
  const secret = process.env.DEMO_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new ScenarioError("DEMO_NOT_CONFIGURED", "Demo session signing is not configured.", 503);
  return secret;
}

export function createDemoSessionToken(
  input: { scenarioId: string; personaId: string },
  secret: string,
  now = Date.now(),
  ttlSeconds = 2 * 60 * 60,
): { token: string; claims: DemoSessionClaims } {
  const claims: DemoSessionClaims = { ...input, issuedAt: now, expiresAt: now + ttlSeconds * 1_000 };
  const payload = encode(JSON.stringify(claims));
  return { token: `${payload}.${sign(payload, secret)}`, claims };
}

export function verifyDemoSessionToken(token: string, secret: string, now = Date.now()): DemoSessionClaims {
  const [payload, signature, extra] = token.split(".");
  const expected = payload ? sign(payload, secret) : "";
  const left = Buffer.from(signature ?? "");
  const right = Buffer.from(expected);
  if (!payload || !signature || extra || left.length !== right.length || !timingSafeEqual(left, right)) {
    throw new ScenarioError("SESSION_INVALID", "Demo session signature is invalid.", 401);
  }
  let claims: DemoSessionClaims;
  try { claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as DemoSessionClaims; }
  catch { throw new ScenarioError("SESSION_INVALID", "Demo session payload is invalid.", 401); }
  if (!claims.scenarioId || !claims.personaId || !Number.isFinite(claims.issuedAt) || !Number.isFinite(claims.expiresAt) || claims.issuedAt > now || claims.expiresAt <= now) {
    throw new ScenarioError("SESSION_INVALID", "Demo session has expired or is invalid.", 401);
  }
  return claims;
}

export function tokenFromRequest(request: Request): string {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Demo ")) return authorization.slice(5).trim();
  const alternate = request.headers.get("x-demo-session");
  if (alternate) return alternate.trim();
  throw new ScenarioError("SESSION_REQUIRED", "A signed Demo session is required.", 401);
}

