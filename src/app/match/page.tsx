"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowIcon } from "@/components/icons";
import { RecapConditions } from "@/components/recap-conditions";
import { SourceBadge } from "@/components/source-badge";
import { personas } from "@/data/demo";
import { useDemo } from "@/lib/demo/state";

export default function MatchPage() {
  const router = useRouter();
  const { state, demoEnabled, loading, pending, error, action } = useDemo();
  if (loading || !state) return <section className="blocked-state"><span className="eyebrow">SIGNED SESSION</span><h1>正在读取共享匹配场景…</h1></section>;
  if (!state.questionConfirmed) return <section className="blocked-state"><span className="eyebrow">先选问题</span><h1>圆桌还不知道要聊什么。</h1><p>标签已经保存。请先从为你筛出的开放问题中选择一个，再开始组桌。</p><Link href="/onboarding" className="primary-button">查看问题推荐<ArrowIcon /></Link></section>;

  const current = personas.find((persona) => persona.id === state.viewer.personaId);
  const participant = state.participants.find((item) => item.userId === state.viewer.personaId);
  const member = state.room.members.find((item) => item.userId === state.viewer.personaId);
  const acceptedCount = state.room.members.filter((item) => item.status === "accepted" || item.status === "active").length;
  const pendingInviteCount = state.room.members.filter((item) => item.status === "invited").length;
  const committedIds = state.room.members.filter((item) => item.status === "accepted" || item.status === "active").map((item) => item.userId);
  const acceptedPerspectiveCount = new Set(committedIds.flatMap((userId) => state.room.perspectiveKinds[userId] ?? [])).size;
  const roomReady = state.room.state === "OPEN" && acceptedCount >= 3 && pendingInviteCount === 0 && acceptedPerspectiveCount >= 3;
  const canStart = roomReady && member?.status === "accepted";
  const matchedPeople = state.match.members.map((item) => ({ match: item, persona: personas.find((persona) => persona.id === item.userId) }));
  async function start() { const next = await action({ type: "start" }); if (next) router.push("/room"); }

  return <div className="match-layout conversation-match-layout">
    <header className="section-heading full"><div><span className="eyebrow">已选问题 · 等待每个人亲自回应</span><h1>{roomReady ? "开房条件已满足，可以开聊" : "这张圆桌正在等大家入席"}</h1><p className="matched-question">{state.discussionSpec.question}</p></div><div className="accept-count"><strong>{acceptedCount}</strong><span>/ 3 人<br/>最低开聊人数</span></div></header>

    <section className="match-plot group-chat-preview" aria-labelledby="group-preview-title">
      <div className="group-chat-header"><div className="stacked-avatars" aria-hidden="true">{matchedPeople.slice(0, 4).map(({ persona }) => <span key={persona?.id}>{persona?.name[0]}</span>)}</div><div><h2 id="group-preview-title">AI × 未来工作 · 异步圆桌</h2><p>匹配后随机组桌 · 聊天室开放 12 小时</p></div></div>
      <div className="match-common-ground"><span className="eyebrow">为什么你们能聊到一起</span><h3>共同关心 AI 如何改变工作、学习与人的选择</h3><p>相似的议题兴趣让对话有起点，不同的知识背景让它不会停在共识里。</p><div className="coverage-tags"><span>AI 与社会</span><span>未来工作</span><span>人的能动性</span></div></div>
      <div className="sample-message-stream" aria-label="即将形成的互补视角">
        {matchedPeople.map(({ match, persona }) => <article className="matched-perspective-message" key={match.userId}><span className={`avatar ${persona?.color ?? "cyan"}`}>{persona?.name[0] ?? "·"}</span><div><header><strong>{persona?.name ?? match.userId}</strong><small>Demo/Test · {persona?.role}</small></header><p>{match.explanation}</p></div></article>)}
      </div>
      <div className="plot-status"><span className={roomReady ? "pulse open" : "pulse"}/><strong>{roomReady ? "聊天室可以开放" : "邀请已发出，等待满足全部开房条件"}</strong><small>模拟时间 {new Date(state.virtualNow).toLocaleString("zh-CN", { hour12: false })}</small></div>
    </section>

    <aside className="match-explanation invitation-panel">
      <SourceBadge>5 个虚构 Demo/Test 档案</SourceBadge>
      <h2>相关之后，保留不同</h2><p>候选人先满足标签、时间、安全与完成率约束，再进行场景级稳定抽签。系统不提供人员目录，也不按“谁更优秀”排序。</p>
      <div className="complement-grid" aria-label="本轮互补背景"><span><b>商科</b>组织与价值</span><span><b>计算机</b>技术与工作流</span><span><b>哲学</b>意义与责任</span><span><b>社会学</b>结构与机会</span></div>
      <div className="draw-note"><span aria-hidden="true">↻</span><div><strong>稳定抽签，不是点人入群</strong><p>同一场景重放会得到一致结果；拒绝或超时后，服务端再从剩余合格候选中递补。</p></div></div>

      <RecapConditions room={state.room} compact viewerStatus={state.viewer.memberStatus} virtualNow={state.virtualNow} demoEnabled={demoEnabled}/>

      {!member ? participant?.inviteStatus === "reserve" ? <div className="invite-note"><strong>当前身份是候补</strong><p>只有成员拒绝或邀请超时后，系统才会按同一套规则发出递补邀请。</p></div> : <div className="invite-note"><strong>当前邀请已处理</strong><p>状态：{participant?.inviteStatus ?? "未参与"}。该身份不能重新进入本轮。</p></div> : <div className="current-invite"><span className="eyebrow">当前身份 · {current?.role}</span><h3>{member.status === "invited" ? "这次愿意加入聊天吗？" : `邀请状态：${member.status}`}</h3>{member.status === "invited" && <><p>接受后不必立刻在线。聊天室开放 12 小时，你可以在方便时回来接着上下文聊。</p><div className="invite-actions"><button disabled={pending} className="primary-button" onClick={() => action({ type: "accept" })}>接受邀请<ArrowIcon /></button><button disabled={pending} className="secondary-button" onClick={() => action({ type: "decline", reason: "skipped" })}>这次没空</button></div><div className="safety-actions"><button disabled={pending} onClick={() => action({ type: "decline", reason: "rejected" })}>不参加这轮</button><button disabled={pending} onClick={() => action({ type: "decline", reason: "blocked" })}>屏蔽并拒绝</button></div></>}</div>}
      {error && <p className="action-error" role="alert">{error}</p>}
      {demoEnabled && <div className="manual-demo-note"><strong>四标签页演示</strong><p>每个身份必须亲自回应邀请。林澈只是 Demo/Test 演示导演，测试控制不会让她成为成员主持人，也不能代替任何人提交内容。</p></div>}
      <button className="primary-button wide" disabled={pending || !canStart} onClick={start}>{canStart ? "打开 12 小时聊天室" : roomReady ? "切换到已接受身份以开聊" : acceptedCount < 3 ? `还需 ${3 - acceptedCount} 人接受` : pendingInviteCount > 0 ? "等待其余邀请回应或超时" : acceptedPerspectiveCount < 3 ? "还需覆盖 3 类互补视角" : "尚未满足开房条件"}<ArrowIcon /></button>
      {!member && <Link className="text-button match-back-link" href="/onboarding">返回问题推荐</Link>}
    </aside>
  </div>;
}
