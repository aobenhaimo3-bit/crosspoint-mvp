"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ScenarioAction, ScenarioView } from "@/server/scenario";
import type { DemoSessionClaims } from "@/server/demo-session";
import { DEMO_SCENARIO_ID, personas, type PersonaId } from "@/data/demo";

export type InviteState = "waiting" | "accepted" | "declined";

export type { ScenarioAction, ScenarioView };

type SessionInfo = Omit<DemoSessionClaims, "personaId"> & { personaId: PersonaId };
type DraftRequest = { personaId: PersonaId; sequence: number };
type DemoContextValue = {
  state: ScenarioView | null;
  session: SessionInfo | null;
  demoEnabled: boolean;
  loading: boolean;
  pending: boolean;
  error: string;
  draftRequest: DraftRequest | null;
  refresh: () => Promise<void>;
  action: (command: ScenarioAction) => Promise<ScenarioView | null>;
  switchIdentity: (personaId: PersonaId) => Promise<boolean>;
  requestDraft: (personaId: PersonaId) => void;
};

const DemoContext = createContext<DemoContextValue | null>(null);
const TOKEN_KEY = "crosspoint.demo.session-token";
const PERSONA_KEY = "crosspoint.demo.persona-id";

type ApiEnvelope = {
  ok: boolean;
  demoEnabled?: boolean;
  sessionToken?: string;
  session?: SessionInfo;
  state?: ScenarioView;
  error?: { code?: string; message?: string };
};

function tokenFromTab(): string | null {
  try { return window.sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
}
function personaFromTab(): PersonaId {
  try {
    const stored = window.sessionStorage.getItem(PERSONA_KEY);
    if (personas.some((persona) => persona.id === stored)) return stored as PersonaId;
  } catch { /* Use the initial Demo identity when tab storage is unavailable. */ }
  return personas[0].id;
}
function saveTabToken(token: string | undefined) {
  if (!token) return;
  try { window.sessionStorage.setItem(TOKEN_KEY, token); } catch { /* This tab will require a new session after refresh. */ }
}
function saveTabIdentity(personaId: PersonaId) {
  try { window.sessionStorage.setItem(PERSONA_KEY, personaId); } catch { /* The signed token remains authoritative. */ }
}
function clearTabToken() { try { window.sessionStorage.removeItem(TOKEN_KEY); } catch { /* no-op */ } }
function authHeaders(token: string | null, json = false): HeadersInit {
  return { ...(json ? { "Content-Type":"application/json" } : {}), ...(token ? { Authorization:`Demo ${token}` } : {}) };
}

export function DemoProvider({ children, demoEnabled: serverDemoEnabled = false }: { children: React.ReactNode; demoEnabled?: boolean }) {
  const [state, setState] = useState<ScenarioView | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [apiDemoEnabled, setApiDemoEnabled] = useState(serverDemoEnabled);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [draftRequest, setDraftRequest] = useState<DraftRequest | null>(null);

  const bootstrap = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const existing = tokenFromTab();
      let response = await fetch("/api/demo/session", { method:"GET", headers:authHeaders(existing), cache:"no-store" });
      let payload = await response.json() as ApiEnvelope;
      if (payload.demoEnabled === false) {
        setApiDemoEnabled(false);
        throw new Error("Demo 模式未启用；正式环境不会签发 Demo 身份。");
      }
      if (!response.ok || !payload.ok || !payload.session) {
        clearTabToken();
        response = await fetch("/api/demo/session", { method:"POST", headers:authHeaders(null, true), body:JSON.stringify({ scenarioId:DEMO_SCENARIO_ID, personaId:personaFromTab() }), cache:"no-store" });
        payload = await response.json() as ApiEnvelope;
      }
      setApiDemoEnabled(payload.demoEnabled ?? serverDemoEnabled);
      if (!response.ok || !payload.ok || !payload.session || !payload.state) throw new Error(payload.error?.message ?? "无法建立 Demo Session。");
      saveTabToken(payload.sessionToken); saveTabIdentity(payload.session.personaId); setSession(payload.session); setState(payload.state);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "无法连接演示场景。"); }
    finally { setLoading(false); }
  }, [serverDemoEnabled]);

  useEffect(() => {
    // The signed tab session is an external resource and must be established after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void bootstrap();
  }, [bootstrap]);

  const refresh = useCallback(async () => {
    if (!session) return bootstrap();
    try {
      const response = await fetch(`/api/scenarios/${encodeURIComponent(session.scenarioId)}`, { headers:authHeaders(tokenFromTab()), cache:"no-store" });
      const payload = await response.json() as ApiEnvelope;
      if (response.status === 401) { clearTabToken(); await bootstrap(); return; }
      if (!response.ok || !payload.ok || !payload.state) throw new Error(payload.error?.message ?? "刷新场景失败。");
      setState(payload.state); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "刷新场景失败。"); }
  }, [bootstrap, session]);

  const action = useCallback(async (command: ScenarioAction): Promise<ScenarioView | null> => {
    if (!session) { setError("Demo Session 尚未就绪。"); return null; }
    setPending(true); setError("");
    try {
      const response = await fetch(`/api/scenarios/${encodeURIComponent(session.scenarioId)}/actions`, { method:"POST", headers:authHeaders(tokenFromTab(), true), body:JSON.stringify(command), cache:"no-store" });
      const payload = await response.json() as ApiEnvelope;
      if (response.status === 401) { clearTabToken(); await bootstrap(); return null; }
      if (!response.ok || !payload.ok || !payload.state) throw new Error(payload.error?.message ?? "操作被场景规则拒绝。");
      setState(payload.state); return payload.state;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "操作被场景规则拒绝。"); return null; }
    finally { setPending(false); }
  }, [bootstrap, session]);

  const switchIdentity = useCallback(async (personaId: PersonaId) => {
    if (!session) return false;
    setPending(true); setError("");
    try {
      const response = await fetch("/api/demo/session", { method:"POST", headers:authHeaders(tokenFromTab(), true), body:JSON.stringify({ scenarioId:session.scenarioId, personaId }), cache:"no-store" });
      const payload = await response.json() as ApiEnvelope;
      if (!response.ok || !payload.ok || !payload.session || !payload.state || !payload.sessionToken) throw new Error(payload.error?.message ?? "切换身份失败。");
      saveTabToken(payload.sessionToken); saveTabIdentity(payload.session.personaId); setSession(payload.session); setState(payload.state); return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "切换身份失败。"); return false; }
    finally { setPending(false); }
  }, [session]);

  useEffect(() => {
    if (!session) return;
    const timer = window.setInterval(() => { if (!pending) void refresh(); }, 1_500);
    return () => window.clearInterval(timer);
  }, [pending, refresh, session]);

  const requestDraft = useCallback((personaId: PersonaId) => {
    setDraftRequest((current) => ({ personaId, sequence:(current?.sequence ?? 0) + 1 }));
  }, []);
  return <DemoContext.Provider value={{ state, session, demoEnabled:serverDemoEnabled && apiDemoEnabled, loading, pending, error, draftRequest, refresh, action, switchIdentity, requestDraft }}>{children}</DemoContext.Provider>;
}

export function useDemo() {
  const value = useContext(DemoContext);
  if (!value) throw new Error("useDemo must be used within DemoProvider");
  return value;
}
