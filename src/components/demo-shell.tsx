"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { personas, type PersonaId } from "@/data/demo";
import { useDemo } from "@/lib/demo/state";
import { CrossMark, PeopleIcon } from "./icons";
import { DemoDirector } from "./demo-director";

const steps = [["/","认识交点"],["/onboarding","标签 → 问题"],["/match","随机组桌"],["/room","12h 聊天"],["/summary","会后复盘"],["/discover","下一轮"]] as const;

export function DemoShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { state, demoEnabled, loading, error } = useDemo();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const currentId = state?.viewer.personaId as PersonaId | undefined;
  const current = personas.find((persona) => persona.id === currentId) ?? personas[0];
  const routeStep = Math.max(0, steps.findIndex(([href]) => href === pathname));
  const activeStep = routeStep;
  return <div className="app-shell">
    <header className="site-header"><Link href="/" className="brand" aria-label="CrossPoint 首页"><CrossMark/><span>CrossPoint</span><em>交点</em></Link><p className="brand-thesis">从标签找到问题，从问题遇见能聊的人。</p>{demoEnabled && <button ref={triggerRef} className="identity-trigger" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open} disabled={loading}><PeopleIcon/><span><small>签名 DEMO 身份</small>{loading ? "正在建立会话" : current.role}</span><b>{current.name[0]}</b></button>}</header>
    <nav className="journey" aria-label="CrossPoint 研讨流程"><ol>{steps.map(([href,label],index) => <li key={href} className={index < activeStep ? "done" : index === activeStep ? "active" : ""}><Link href={href} aria-current={index === activeStep ? "step" : undefined}><span>{index < activeStep ? "✓" : String(index+1).padStart(2,"0")}</span>{label}</Link></li>)}</ol></nav>
    {error && !open && <div className="global-error" role="alert">{error}</div>}
    <main id="main-content" className="page-frame">{children}</main>
    <footer className="site-footer"><span>CrossPoint MVP · 所有人物均为虚构演示档案</span><span>业务进度保存在服务端场景；本标签页仅保存签名会话</span></footer>
    <div className="live-region" aria-live="polite">{state ? `当前演示身份：${current.role}；房间状态：${state.room.state}` : "正在建立演示会话"}</div>
    {demoEnabled && <DemoDirector open={open} onClose={close} triggerRef={triggerRef}/>} 
  </div>;
}
