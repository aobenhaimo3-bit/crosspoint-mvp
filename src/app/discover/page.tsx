"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, UsersRound } from "lucide-react";
import { ArrowIcon } from "@/components/icons";
import { SourceBadge } from "@/components/source-badge";
import { useDemo } from "@/lib/demo/state";

function formatCooldown(milliseconds:number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  return `${String(Math.floor(seconds / 60)).padStart(2,"0")}:${String(seconds % 60).padStart(2,"0")}`;
}

function useRefreshCooldown(availableAt?:string, serverNow?:string) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!availableAt || !serverNow) return;
    const serverAnchor = Date.parse(serverNow);
    const wallAnchor = Date.now();
    const tick = () => setRemaining(Math.max(0, Date.parse(availableAt) - serverAnchor - (Date.now() - wallAnchor)));
    const firstFrame = window.requestAnimationFrame(tick);
    const timer = window.setInterval(tick, 250);
    return () => { window.cancelAnimationFrame(firstFrame); window.clearInterval(timer); };
  }, [availableAt, serverNow]);
  const activeRemaining = availableAt && serverNow ? remaining : 0;
  return { remaining:activeRemaining, label:formatCooldown(activeRemaining) };
}

export default function DiscoverPage() {
  const router = useRouter();
  const { state, demoEnabled, loading, pending, error, action } = useDemo();
  const cooldown = useRefreshCooldown(state?.nextRoomRefreshAvailableAt, state?.serverNow);
  const [refreshing, setRefreshing] = useState(false);

  if (loading || !state) return <section className="blocked-state"><span className="eyebrow">SIGNED SESSION</span><h1>正在生成下一批聊天室…</h1></section>;
  if (state.room.state !== "ENDED" || state.room.terminalReason !== "COMPLETED" || !state.room.summary) return <section className="blocked-state"><span className="eyebrow">NEXT-LOOP GATE</span><h1>先完成一轮圆桌。</h1><p>真实发言、认知空位和会后反馈会共同影响下一轮匹配。</p><Link href="/room" className="primary-button">返回研讨室<ArrowIcon/></Link></section>;

  async function chooseNext(questionId:string) {
    if (!state?.viewer.controller) return;
    if (await action({type:"chooseQuestion",questionId})) router.push("/match");
  }
  async function refreshRooms() {
    if (pending || refreshing || cooldown.remaining > 0) return;
    setRefreshing(true);
    try { await action({type:"refreshNextRooms"}); }
    finally { setRefreshing(false); }
  }

  const unresolved = state.room.summary.unresolvedQuestions[0];
  const highSignalCount = state.ratingAggregates.filter((item) => item.inspiration >= 4).length;
  const rooms = state.nextRoomRecommendations;

  return <main className="discover-layout">
    <header className="discover-hero"><span className="eyebrow">NEXT ROUND · RANDOM MATCHING</span><h1>下一轮，去一张<br/>新的圆桌。</h1><p>系统先用你确认过的标签筛选合适问题，再从合格候选人中随机组成专业互补的聊天室。刷新只换一批真实匹配结果，不会自动替你加入。</p></header>
    <section className="recommendation-context" aria-label="推荐依据"><div><span>本轮未解决</span><strong>{unresolved ?? "暂无明确未解决问题"}</strong></div><div><span>认知空位</span><strong>{state.perspectiveMap?.vacancies.map((item) => item.label).join("、") || "暂无"}</strong></div><div><span>会后反馈</span><strong>{highSignalCount ? `${highSignalCount} 个匿名高启发信号` : "等待更多匿名反馈"}</strong></div></section>
    <section className="related-section next-room-section" aria-labelledby="related-title">
      <div className="related-heading"><div><span className="eyebrow">ROOMS, NOT A PLAYLIST</span><h2 id="related-title">为你匹配的新聊天室</h2><p className="selection-gate-note">每张卡片都由服务端用当前身份的标签重新匹配。{demoEnabled && "演示模式下仅由演示导演开启下一轮。"}</p></div><div className="room-refresh-control"><SourceBadge>{demoEnabled ? "Demo/Test 候选 · 服务端匹配" : "服务端实时匹配"}</SourceBadge><button type="button" className="room-refresh-button" disabled={pending || refreshing || cooldown.remaining > 0} onClick={() => void refreshRooms()} aria-label={cooldown.remaining > 0 ? `换一批聊天室，${cooldown.label} 后可刷新` : "换一批聊天室"} title={cooldown.remaining > 0 ? `${cooldown.label} 后可刷新` : "换一批"}><RefreshCw aria-hidden="true" className={refreshing ? "is-spinning" : ""}/><span>{cooldown.remaining > 0 ? cooldown.label : refreshing ? "匹配中" : "换一批"}</span></button></div></div>
      <div className="question-list next-room-list">{rooms.length ? rooms.map((room,index) => <article key={room.id} className={index === 0 ? "recommended-question" : ""}><div className="question-index">{index === 0 ? "推荐" : `R${index+1}`}</div><div><h3>{room.question}</h3><div className="coverage-tags">{room.perspectiveLabels.map((lens) => <span key={lens}>{lens}</span>)}</div><div className="recommendation-signals"><small><UsersRound aria-hidden="true"/>预计 {room.memberCount} 人</small><small>✓ {room.reason}</small></div><p>进入后仍需成员逐一接受邀请，至少 3 人接受才会开房。</p></div><button disabled={pending || !state.viewer.controller} onClick={() => void chooseNext(room.questionId)} aria-label={`选择聊天室：${room.question}`}>{state.viewer.controller ? "选择并重新匹配" : demoEnabled ? "等待演示导演开启" : "等待本轮开启"}<ArrowIcon/></button></article>) : <div className="empty-room-recommendations"><strong>这一批暂时没有合格圆桌</strong><p>候选人的可用时段或标签覆盖不足；冷却结束后可以再换一批。</p></div>}</div>
    </section>
    {error && <p className="action-error" role="alert">{error}</p>}
    <aside className="loop-note"><span className="vacancy-mark"/><div><strong>刷新有 5 分钟冷却</strong><p>冷却按当前 Demo 身份写入共享持久化数据，刷新页面或修改前端时间都不会清除。</p></div></aside>
  </main>;
}
