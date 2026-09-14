"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { personas, positionDrafts, type PersonaId } from "@/data/demo";
import { useDemo } from "@/lib/demo/state";
import { RecapConditions } from "./recap-conditions";

export function DemoDirector({ open, onClose, triggerRef }: { open: boolean; onClose: () => void; triggerRef: React.RefObject<HTMLButtonElement | null> }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);
  const { state, session, pending, error, switchIdentity, action, requestDraft } = useDemo();
  const currentId = state?.viewer.personaId as PersonaId | undefined;
  const current = personas.find((persona) => persona.id === currentId) ?? personas[0];

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { onClose(); window.setTimeout(() => triggerRef.current?.focus(), 0); }
      if (event.key === "Tab") {
        const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), a[href], input") ?? []);
        const first = focusable[0]; const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, open, triggerRef]);

  if (!open || !state || !session) return null;
  async function chooseIdentity(id: PersonaId) { if (await switchIdentity(id)) { onClose(); window.setTimeout(() => triggerRef.current?.focus(), 0); } }
  async function reset() { if (window.confirm("重置共享演示场景？所有标签页都会看到重置后的状态。")) { const next = await action({ type:"reset" }); if (next) { onClose(); router.push("/"); } } }
  async function fillDraft() { requestDraft(current.id); onClose(); router.push("/room"); }
  async function advanceTime() { await action({ type:"advanceTime", hours:12 }); }

  return <div className="drawer-backdrop" onMouseDown={onClose}>
    <div ref={dialogRef} className="demo-drawer" role="dialog" aria-modal="true" aria-labelledby="demo-title" onMouseDown={(event) => event.stopPropagation()}>
      <div className="drawer-head"><div><span className="eyebrow">SIGNED TAB SESSION</span><h2 id="demo-title">演示导演台</h2></div><button className="icon-button" onClick={onClose} aria-label="关闭演示导演台">×</button></div>
      <p className="drawer-note">本标签页签名绑定为「{current.role}」。林澈是 Demo/Test 演示导演，仅拥有测试控制权限；她不是成员主持人。AI 主持只负责流程提示与自动总结。</p>
      <div className="director-clock"><span>共享模拟时间</span><strong>{new Date(state.virtualNow).toLocaleString("zh-CN", { hour12:false })}</strong></div>
      <ul className="identity-list">{personas.map((persona) => {
        const status = state.participants.find((item) => item.userId === persona.id);
        const detail = status ? `${status.inviteStatus} · ${status.positionStatus === "submitted" ? "已开场" : "未开场"} · ${status.responseStatus === "submitted" ? "已回复" : "未回复"}` : "状态不可用";
        return <li key={persona.id}><button disabled={pending} onClick={() => chooseIdentity(persona.id)} className={persona.id === currentId ? "selected" : ""}><span className={`identity-dot node-${persona.color}`}>{persona.name[0]}</span><span><strong>{persona.role}</strong><small>Demo/Test · {detail}</small></span><b>{persona.id === currentId ? "当前标签页" : "切换"}</b></button></li>;
      })}</ul>
      <RecapConditions room={state.room} compact viewerStatus={state.viewer.memberStatus} virtualNow={state.virtualNow} demoEnabled/>
      <div className="director-actions"><span className="eyebrow">演示导演操作 · 仅用于测试流程</span><button disabled={pending} onClick={fillDraft}>填入当前身份聊天草稿</button><button disabled={pending || !state.viewer.controller} onClick={advanceTime}>推进模拟时间 +12 小时</button><small>{state.viewer.controller ? "当前身份是林澈，可推进模拟时间与重置；不能代发，也不能绕过提交门禁。" : "测试控制仅限演示导演林澈；其他身份与正式成员权限一致。"}</small></div>
      {error && <p className="action-error" role="alert">{error}</p>}
      <button className="reset-button" disabled={pending || !state.viewer.controller} onClick={reset}>重置共享演示场景</button>
      <p className="director-rule">没有“一键补齐”。请逐个切换四位受邀身份，分别处理邀请、发送开场消息并引用回应同桌。</p>
      <p className="draft-preview">当前示例：{positionDrafts[current.id].judgment}</p>
    </div>
  </div>;
}
