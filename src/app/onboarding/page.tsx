"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { InterestPicker } from "@/components/interest-picker";
import { ArrowIcon } from "@/components/icons";
import { SourceBadge } from "@/components/source-badge";
import { buildOnboardingProfile, canonicalDemoProfiles, contributeTags, learnTags, perspectiveTags, topicTagGroups } from "@/data/demo";
import { validateProfileGate, type RoomState } from "@/domain";
import { useDemo } from "@/lib/demo/state";

type TagGroupProps = { legend: string; hint: string; items: string[]; selected: string[]; minimum: number; onToggle: (item: string) => void };

function TagGroup({ legend, hint, items, selected, minimum, onToggle }: TagGroupProps) {
  const complete = selected.length >= minimum;
  return <fieldset className={`tag-group tara-tag-group ${complete ? "is-complete" : ""}`}>
    <legend><span>{legend}</span><small>{hint}</small></legend>
    <div className="tag-options">{items.map((item) => <button key={item} type="button" className={selected.includes(item) ? "tag selected" : "tag"} aria-pressed={selected.includes(item)} onClick={() => onToggle(item)}>{selected.includes(item) ? "✓ " : "+ "}{item}</button>)}</div>
    <p className={complete ? "count-ok" : "count-note"} aria-live="polite">{complete ? "已满足" : `还需 ${minimum - selected.length} 个`} · 已选 {selected.length}</p>
  </fieldset>;
}

const questionMeta: Record<string, { why: string; lenses: readonly string[]; source: string; href?: string }> = {
  "q-ai-major": {
    why: "与你的未来工作、个人经验和跨专业视角高度相关",
    lenses: ["工作意义", "人的主体性", "组织与技术"],
    source: "由知乎公开问题改写 · 检索于 2026-09-15",
    href: "https://www.zhihu.com/question/1992917921941439400",
  },
  "q-first-experience": { why: "适合从教育、招聘与代际公平共同探究", lenses: ["青年机会", "信任", "人才培养"], source: "知乎 AI 与未来工作公开讨论素材" },
  "q-ai-curriculum": { why: "适合连接学习者、技术实践与人文反思", lenses: ["学习过程", "能力形成", "技术边界"], source: "知乎 AI 与教育公开讨论素材" },
  "q-skill-proof": { why: "适合连接组织判断、能力证据与机会公平", lenses: ["能力验证", "招聘判断", "机会公平"], source: "知乎 AI 与就业公开讨论素材" },
};

function continuationFor(state: RoomState): { href: string; label: string; detail: string } {
  if (state === "WAITING_ACCEPTANCE" || state === "OPEN") {
    return { href:"/match", label:"继续处理邀请", detail:"当前圆桌还在邀请阶段，请继续接受、拒绝或等待递补。" };
  }
  if (state === "INDEPENDENT" || state === "CROSS_RESPONSE") {
    return { href:"/room", label:"返回 12h 聊天室", detail:"当前圆桌已经开始，请继续完成本阶段的发言。" };
  }
  return { href:"/summary", label:"查看会后复盘", detail:"当前圆桌正在收束，请前往复盘页查看状态。" };
}

export default function OnboardingPage() {
  const router = useRouter();
  const { state, action, demoEnabled, loading, pending, error: apiError } = useDemo();
  const [view, setView] = useState<"profile" | "questions">("profile");
  const [topics, setTopics] = useState<string[]>([]);
  const [role, setRole] = useState("");
  const [contributes, setContributes] = useState<string[]>([]);
  const [learns, setLearns] = useState<string[]>([]);
  const [perspectives, setPerspectives] = useState<string[]>([]);
  const [availability, setAvailability] = useState("时间灵活，12 小时内回应");
  const [error, setError] = useState("");
  const toggle = (list: string[], item: string, setter: (next: string[]) => void) => setter(list.includes(item) ? list.filter((value) => value !== item) : [...list, item]);
  const checks = useMemo(() => [topics.length >= 3, Boolean(role), contributes.length >= 2, learns.length >= 2, perspectives.length >= 1], [topics, role, contributes, learns, perspectives]);
  const completeCount = checks.filter(Boolean).length;
  const profileReady = completeCount === checks.length;

  function currentProfile() {
    const base = buildOnboardingProfile({ topics, role, contributes, learns, perspective: perspectives[0], availability });
    const demoProfile = canonicalDemoProfiles.find((profile) => profile.id === state?.viewer.personaId);
    return demoProfile ? { ...base, id: demoProfile.id, displayName: demoProfile.displayName } : base;
  }

  async function showRecommendations() {
    setError("");
    if (!profileReady) return setError("补齐标红的标签组后，才会生成问题推荐。");
    const profile = currentProfile();
    const gate = validateProfileGate(profile);
    if (!gate.ok) return setError(`标签门禁未通过：${gate.errors.join("、")}。`);
    const saved = await action({ type: "saveProfile", profile });
    if (!saved) return;
    setView("questions");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function chooseQuestion(questionId: string) {
    if (!state) return;
    setError("");
    const chosen = await action({ type: "chooseQuestion", questionId });
    if (chosen) router.push("/match");
  }

  async function resetLockedScenario() {
    if (!window.confirm("重置共享演示场景？当前邀请、发言和回复进度都会清空，所有标签页将同步重置。")) return;
    const reset = await action({ type:"reset" });
    if (!reset) return;
    setError("");
    setView("profile");
    window.scrollTo({ top:0, behavior:"smooth" });
    router.replace("/onboarding");
  }

  if (loading || !state) return <section className="blocked-state"><span className="eyebrow">SIGNED SESSION</span><h1>正在读取你的标签场景…</h1></section>;
  if (!state.reconfigurationAllowed) {
    const continuation = continuationFor(state.room.state);
    return <section className="blocked-state scenario-lock-state">
      <span className="eyebrow">ROUND IN PROGRESS · 共享场景已锁定</span>
      <h1>这轮已经开始，<br/>现在不能重新改题。</h1>
      <p>{continuation.detail} 已有成员响应后，标签与问题会锁定，避免覆盖其他人的共享进度；切换身份不会解除这个锁。</p>
      <div className="scenario-lock-actions">
        <Link href={continuation.href} className="primary-button">{continuation.label}<ArrowIcon/></Link>
        {demoEnabled && state.viewer.controller
          ? <button type="button" className="secondary-button" disabled={pending} onClick={() => void resetLockedScenario()}>{pending ? "正在重置…" : "重置并重新设置标签"}</button>
          : <span className="scenario-lock-note">需要从头演示时，请在右上角导演台切换到林澈；切换后本页会出现重置按钮。</span>}
      </div>
      {apiError && <p className="action-error" role="alert">{apiError}</p>}
    </section>;
  }

  return <div className="onboarding-layout profile-funnel-layout">
    <header className="section-heading full">
      <div><span className="eyebrow">{view === "profile" ? "先画像，再推荐" : "你的 3 个问题推荐"}</span><h1>{view === "profile" ? "用标签介绍你想带进对话的部分" : "哪一个问题，让你想听见别人？"}</h1><p>{view === "profile" ? "像整理一张会变化的名片：点选、取消、再修改。系统只使用你亲自确认的内容。" : "这些不是辩题，没有预设立场。选择一个你愿意和陌生人共同弄明白的问题。"}</p></div>
      <SourceBadge>{view === "profile" ? "本人确认 · 仅用于匹配" : "根据已确认标签生成"}</SourceBadge>
    </header>

    <nav className="funnel-progress" aria-label="匹配准备进度"><ol><li className="active"><span>1</span>设定标签</li><li className={view === "questions" ? "active" : ""}><span>2</span>选择问题</li><li><span>3</span>随机组桌</li></ol></nav>
    {(error || apiError) && <div className="error-summary" role="alert"><strong>还不能继续</strong><span>{error || apiError}</span></div>}

    {view === "profile" ? <>
      <section className="onboarding-sheet tara-tag-sheet" aria-labelledby="tag-sheet-title">
        <div className="tag-sheet-intro"><div><span className="step-number">PROFILE TAGS</span><h2 id="tag-sheet-title">你的交点画像</h2></div><strong aria-live="polite">{completeCount} / {checks.length} 组完成</strong></div>
        <InterestPicker groups={topicTagGroups} selected={topics} minimum={3} onToggle={(item) => toggle(topics, item, setTopics)} />
        <label className={`select-label role-tag-select ${role ? "is-complete" : ""}`}>我从哪里出发？<small>选择一个最接近的专业或经历</small><select value={role} onChange={(event) => setRole(event.target.value)}><option value="">选择你的视角起点</option><option>商科 / 组织</option><option>计算机 / 工程</option><option>哲学 / 人文</option><option>社会学 / 劳动</option><option>AI 产品 / 实践</option></select></label>
        <div className="split-fields"><TagGroup legend="我能贡献" hint="至少 2 个经验" items={contributeTags} selected={contributes} minimum={2} onToggle={(item) => toggle(contributes, item, setContributes)} /><TagGroup legend="我想了解" hint="至少 2 个问题" items={learnTags} selected={learns} minimum={2} onToggle={(item) => toggle(learns, item, setLearns)} /></div>
        <TagGroup legend="我希望遇见" hint="至少 1 种不同视角" items={perspectiveTags} selected={perspectives} minimum={1} onToggle={(item) => toggle(perspectives, item, setPerspectives)} />
        <label className="select-label availability-select">通常多久能回到聊天室？<select value={availability} onChange={(event) => setAvailability(event.target.value)}><option>6 小时内回应</option><option>时间灵活，12 小时内回应</option><option>当天晚些时候回应</option></select></label>
        <div className="form-actions"><Link className="text-button" href="/">返回</Link><button className="primary-button" disabled={pending || !profileReady} onClick={showRecommendations}>{profileReady ? "根据标签推荐问题" : `还需完成 ${checks.length - completeCount} 组`}<ArrowIcon /></button></div>
      </section>
      <aside className="gate-aside profile-gate-aside"><span className="eyebrow">即时门禁</span><h2>你控制标签，<br/>标签决定推荐。</h2><p>兴趣说明相关性；贡献和好奇心帮助系统寻找互补者。敏感属性不会被推断。</p><ul><li className={checks[0] ? "done" : ""}>3 个兴趣标签</li><li className={checks[1] ? "done" : ""}>1 个专业或经历</li><li className={checks[2] ? "done" : ""}>2 个可贡献经验</li><li className={checks[3] ? "done" : ""}>2 个想了解方向</li><li className={checks[4] ? "done" : ""}>1 个希望遇见的视角</li></ul></aside>
    </> : <section className="question-recommendations full" aria-labelledby="recommendation-title">
      <div className="recommendation-summary"><div><span className="eyebrow">匹配依据</span><h2 id="recommendation-title">因为你关心这些交点</h2></div><div className="coverage-tags" aria-label="已确认标签摘要">{[...topics.slice(0, 3), ...contributes.slice(0, 1), ...learns.slice(0, 1)].map((item) => <span key={item}>{item}</span>)}</div><button type="button" className="text-button" onClick={() => setView("profile")}>编辑我的标签</button></div>
      <div className="question-card-list">{state.questionRecommendations.map((question, index) => { const meta = questionMeta[question.questionId] ?? { why:"与你已确认的标签存在多个交点", lenses:["AI 与社会"], source:"知乎公开讨论素材" }; return <article className={`recommended-question-card ${index === 0 ? "featured" : ""}`} key={question.questionId}>
        <div className="question-card-meta"><span>{index === 0 ? "最相关" : `推荐 ${index + 1}`}</span><small>{meta.source}</small></div>
        <h3>{question.question}</h3><p>{meta.why}</p>
        <div className="coverage-tags" aria-label="问题涉及视角">{meta.lenses.map((lens) => <span key={lens}>{lens}</span>)}</div>
        {meta.href && <details className="question-source-detail"><summary>这道题从哪里来？</summary><p>改写自知乎公开问题「2026年，站在AI与人文的十字路口：00后如何定义自己的“新饭碗”与“新活法”？」</p></details>}
        <div className="question-card-actions"><button className="primary-button" disabled={pending} onClick={() => chooseQuestion(question.questionId)}>{pending ? "正在进入匹配池…" : "选择这个问题"}<ArrowIcon /></button>{meta.href && <a className="source-link" href={meta.href} target="_blank" rel="noreferrer">查看知乎原问题<span aria-hidden="true"> ↗</span></a>}</div>
      </article>; })}</div>
      <p className="recommendation-note">选题后，系统才会在满足标签、时间与安全约束的人中进行稳定抽签。你不会看到可点选的人员目录。</p>
    </section>}
  </div>;
}
