"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowIcon } from "@/components/icons";
import { Roundtable } from "@/components/roundtable";
import { RecapConditions } from "@/components/recap-conditions";
import { SourceBadge } from "@/components/source-badge";
import { personas, type PersonaId } from "@/data/demo";
import { useDemo } from "@/lib/demo/state";

type RatingDraft = { suitability:number; inspiration:number; comment:string };
const blankRating = (): RatingDraft => ({ suitability:4, inspiration:4, comment:"" });

export default function SummaryPage() {
  const { state, demoEnabled, loading, pending, error, action } = useDemo();
  const [ratings, setRatings] = useState<Record<string,RatingDraft>>({});
  if (loading || !state) return <section className="blocked-state"><span className="eyebrow">SIGNED SESSION</span><h1>正在读取动态总结…</h1></section>;
  const roundComplete = state.room.state === "ENDED" && state.room.terminalReason === "COMPLETED";
  const viewerCanRead = state.viewer.memberStatus === "active" || state.viewer.memberStatus === "exited";
  if (!roundComplete || !state.room.summary || !state.perspectiveMap) {
    const denied = roundComplete && !viewerCanRead;
    const temporarilyUnavailable = roundComplete && viewerCanRead;
    return <section className="blocked-state recap-blocked-state"><span className="eyebrow">SUMMARY GATE</span><h1>{denied ? "会后复盘已生成，但当前身份无查看权限。" : temporarilyUnavailable ? "复盘暂不可读取。" : "会后复盘尚未解锁。"}</h1><p>{denied ? "只有本轮实际参与者可以查看总结与 Perspective Map；未参与、拒绝或超时身份不可读取。" : temporarilyUnavailable ? "你有查看权限，但总结或 Perspective Map 暂未就绪，请稍后重试。" : "需同时满足 12 小时归零、全员首发和全员至少一次跨成员回应；到期缺项时，补齐后才会解锁。"}</p><RecapConditions room={state.room} viewerStatus={state.viewer.memberStatus} virtualNow={state.virtualNow} demoEnabled={demoEnabled}/><Link href="/room" className="primary-button">返回研讨室<ArrowIcon /></Link></section>;
  }

  const discussion = state.discussionSpec;
  const map = state.perspectiveMap;
  const viewerId = state.viewer.personaId;
  const participantIds = state.room.members.filter((member) => member.status === "active" || member.status === "exited").map((member) => member.userId).filter((id): id is PersonaId => personas.some((persona) => persona.id === id));
  const peers = participantIds.filter((id) => id !== viewerId);
  const missingLabels = map.vacancies.map((item) => item.label);
  const invites = Object.fromEntries(personas.map((persona) => { const member = state.room.members.find((item) => item.userId === persona.id); return [persona.id, member?.status === "active" || member?.status === "accepted" || member?.status === "exited" ? "accepted" : member?.status === "invited" ? "waiting" : "declined"]; })) as Record<PersonaId,"waiting"|"accepted"|"declined">;
  const summary = state.room.summary;
  const headline = summary.headline ?? "本轮形成了一个值得继续追问的焦点";

  function updateRating(targetUserId:string, patch:Partial<RatingDraft>) { setRatings((current) => ({ ...current, [targetUserId]:{ ...(current[targetUserId] ?? blankRating()), ...patch } })); }
  async function submitRating(targetUserId:string) { const draft = ratings[targetUserId] ?? blankRating(); await action({ type:"submitPeerRating", targetUserId, suitability:draft.suitability, inspiration:draft.inspiration, ...(draft.comment.trim() ? { comment:draft.comment.trim() } : {}) }); }
  async function requestConnection(targetUserId:string) { await action({ type:"requestConnection", targetUserId }); }
  async function respondConnection(requesterUserId:string, accept:boolean) { await action({ type:"respondConnection", requesterUserId, accept }); }

  return <main className="summary-layout">
    <header className="section-heading full"><div><span className="eyebrow">ROUND CLOSED · 基于真实发言的收束</span><h1>{headline}</h1><p className="matched-question">{discussion.question}</p></div><SourceBadge>{demoEnabled ? "AI 主持总结 · Demo/Test" : "AI 主持总结"}</SourceBadge></header>
    <RecapConditions room={state.room} viewerStatus={state.viewer.memberStatus} virtualNow={state.virtualNow} demoEnabled={demoEnabled}/>
    <section className="map-panel"><div className="panel-heading"><div><span className="eyebrow">PERSPECTIVE MAP · {map.nodes.length} 个真实提交节点</span><h2>这张圆桌看见了什么</h2></div><div className="map-legend" aria-label="视角地图图例"><span><i className="solid"/>支持 / 证据</span><span><i className="split"/>分歧</span><span><i className="dashed"/>认知空位</span></div></div><Roundtable invites={invites} participantIds={participantIds} vacancyLabels={missingLabels} question={discussion.question} mapMode mapNodes={map.nodes} mapEdges={map.edges}/></section>
    <section className="summary-notes" aria-label="讨论总结">
      <article><span>01 · 讨论焦点</span><h3>{headline}</h3><p>从本轮真实发言中提炼，不代表平台裁定结论。</p></article>
      <article className="disagreement"><span>02 · 核心分歧</span><h3>{summary.disagreements[0] ?? "暂无"}</h3><p>保留差异，比制造虚假的一致更重要。</p></article>
      <article><span>03 · 证据缺口</span><h3>{summary.evidenceGaps[0] ?? "暂无"}</h3><p>下一轮可以专门寻找这里缺失的样本与经验。</p></article>
      <article><span>04 · 未解决问题</span><h3>{summary.unresolvedQuestions[0] ?? "暂无"}</h3><p>它会成为下一批问题推荐的重要信号。</p></article>
    </section>

    <section className="map-accessible" aria-labelledby="map-text-title">
      <div><span className="eyebrow">文本视图</span><h2 id="map-text-title">每个视角留下的判断</h2><p>图中的节点和关系也以文本提供，便于阅读与辅助技术访问。</p></div>
      <ul>{map.nodes.map((node) => { const profile = personas.find((item) => item.id === node.userId); return <li key={node.userId}><strong>{profile?.name ?? node.userId} · {profile?.role ?? "参与者"}</strong><span>{node.judgment}</span></li>; })}{map.vacancies.map((vacancy) => <li className="vacancy" key={vacancy.slotId}><strong>仍缺少 · {vacancy.label}</strong><span>下一轮可优先寻找这一视角。</span></li>)}</ul>
    </section>

    <section className="peer-feedback-panel" aria-labelledby="peer-feedback-title">
      <div className="panel-heading"><div><span className="eyebrow">PRIVATE PEER FEEDBACK</span><h2 id="peer-feedback-title">和谁适合继续聊？</h2><p>评分只用于改善下一轮匹配。对方看不到你的单条分数或短评，只会看到匿名聚合后的推荐信号。</p></div></div>
      <div className="peer-feedback-grid">{peers.map((peerId) => {
        const peer = personas.find((item) => item.id === peerId);
        const draft = ratings[peerId] ?? blankRating();
        const submitted = state.myRatingTargetIds.includes(peerId);
        const aggregate = state.ratingAggregates.find((item) => item.userId === peerId);
        const connection = state.connections.find((item) => item.userId === peerId);
        return <article className="peer-feedback-card" key={peerId}>
          <header><span className={`chat-avatar persona-${peer?.color ?? "cyan"}`} aria-hidden="true">{peer?.name[0]}</span><div><h3>{peer?.name}</h3><p>{peer?.role}</p></div>{aggregate && <span className="peer-signal" title="匿名聚合推荐信号">{aggregate.count} 人反馈 · 适聊 {aggregate.suitability.toFixed(1)} · 启发 {aggregate.inspiration.toFixed(1)}</span>}</header>
          <fieldset disabled={submitted || pending}><legend className="sr-only">评价 {peer?.name}</legend><label>适聊度 <span>{draft.suitability}/5</span><input type="range" min="1" max="5" step="1" value={draft.suitability} onChange={(event) => updateRating(peerId,{suitability:Number(event.target.value)})}/></label><label>启发度 <span>{draft.inspiration}/5</span><input type="range" min="1" max="5" step="1" value={draft.inspiration} onChange={(event) => updateRating(peerId,{inspiration:Number(event.target.value)})}/></label><label>可选短评<textarea value={draft.comment} maxLength={160} placeholder="仅用于你的私密会后反馈" onChange={(event) => updateRating(peerId,{comment:event.target.value})}/></label><button className="secondary-button wide" type="button" disabled={submitted || pending} onClick={() => void submitRating(peerId)}>{submitted ? "✓ 我的评价已提交" : "提交私密评价"}</button></fieldset>
          <div className="connection-actions">{connection?.status === "accepted" ? <div className="test-contact"><strong>双方已同意交换 Test 联系标识</strong><code>{connection.zhihuHandle ?? `test_${peerId}`}</code><small>虚构 Demo/Test 知乎号，不对应真人；CrossPoint 不会代发私信。</small></div> : connection?.status === "incoming_pending" ? <><p>{peer?.name} 想继续聊并交换 Test 知乎号。</p><button disabled={pending} onClick={() => void respondConnection(peerId,true)}>同意交换</button><button disabled={pending} onClick={() => void respondConnection(peerId,false)}>暂不交换</button></> : <button className="connection-request" disabled={pending || connection?.status === "outgoing_pending" || connection?.status === "declined"} onClick={() => void requestConnection(peerId)}>{connection?.status === "outgoing_pending" ? "已发送 · 等待双方同意" : connection?.status === "declined" ? "本轮未交换" : "想继续聊 / 交换知乎号"}</button>}</div>
        </article>;
      })}</div>
      <p className="demo-contact-disclaimer">本演示中的姓名与知乎号均为虚构 Test 数据，不冒充真人，也不会代表用户发送任何站内信。</p>
      {error && <p className="action-error" role="alert">{error}</p>}
    </section>

    <div className="summary-cta"><div><span className="eyebrow">KEEP THE LOOP MOVING</span><h2>把认知空位和会后反馈带进下一轮。</h2></div><Link className="primary-button large" href="/discover">查看下一批问题<ArrowIcon /></Link></div>
  </main>;
}
