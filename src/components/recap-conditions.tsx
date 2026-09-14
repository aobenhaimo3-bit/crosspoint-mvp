type ConditionRoom = {
  state: string;
  terminalReason?: string;
  expiresAt?: string;
  members: readonly { userId: string; status: string }[];
  perspectiveKinds?: Readonly<Record<string, readonly string[]>>;
  positions: readonly { authorId: string }[];
  responses: readonly { authorId: string }[];
  summary?: unknown;
};

type Condition = {
  label: string;
  progress: string;
  complete: boolean;
};

const committedStatus = new Set(["accepted", "active", "exited"]);
const startedStates = new Set(["INDEPENDENT", "CROSS_RESPONSE", "SYNTHESIS", "ENDED"]);

function ConditionList({ title, eyebrow, items }: { title: string; eyebrow: string; items: readonly Condition[] }) {
  const completed = items.filter((item) => item.complete).length;
  return <section className="condition-group" aria-label={title}>
    <header><div><span>{eyebrow}</span><h3>{title}</h3></div><strong>{completed}/{items.length}</strong></header>
    <ol>{items.map((item) => <li className={item.complete ? "is-complete" : ""} key={item.label}>
      <i aria-hidden="true">{item.complete ? "✓" : "○"}</i><span>{item.label}</span><b>{item.progress}</b>
    </li>)}</ol>
  </section>;
}

export function RecapConditions({ room, compact = false, viewerStatus, virtualNow, countdownLabel, demoEnabled = false }: { room: ConditionRoom; compact?: boolean; viewerStatus?: string; virtualNow?: string; countdownLabel?: string; demoEnabled?: boolean }) {
  const committedIds = room.members.filter((member) => committedStatus.has(member.status)).map((member) => member.userId);
  const activeIds = room.members.filter((member) => member.status === "active").map((member) => member.userId);
  const discussionTarget = activeIds.length || 3;
  const acceptedCount = committedIds.length;
  const resolvedCount = room.members.filter((member) => member.status !== "invited").length;
  const perspectiveCount = new Set(committedIds.flatMap((userId) => room.perspectiveKinds?.[userId] ?? [])).size;
  const positionAuthors = new Set(room.positions.map((position) => position.authorId));
  const responseAuthors = new Set(room.responses.map((response) => response.authorId));
  const positionCount = activeIds.filter((userId) => positionAuthors.has(userId)).length;
  const responseCount = activeIds.filter((userId) => responseAuthors.has(userId)).length;
  const roomStarted = startedStates.has(room.state);
  const positionsComplete = roomStarted && activeIds.length > 0 && activeIds.every((userId) => positionAuthors.has(userId));
  const responsesComplete = roomStarted && activeIds.length > 0 && activeIds.every((userId) => responseAuthors.has(userId));
  const recapReady = room.state === "ENDED" && room.terminalReason === "COMPLETED";
  const countdownComplete = recapReady || countdownLabel === "00:00:00" || Boolean(room.expiresAt && virtualNow && Date.parse(virtualNow) >= Date.parse(room.expiresAt));

  const opening: Condition[] = [
    { label:"至少 3 人接受邀请", progress:`${acceptedCount}/3`, complete:acceptedCount >= 3 },
    { label:"所有当前邀请已回应或超时", progress:`${resolvedCount}/${room.members.length}`, complete:room.members.length > 0 && resolvedCount === room.members.length },
    { label:"接受成员覆盖至少 3 类贡献视角", progress:`${perspectiveCount}/3`, complete:perspectiveCount >= 3 },
  ];
  const recap: Condition[] = [
    { label:"聊天室 12 小时倒计时归零", progress:countdownComplete ? "已归零" : countdownLabel ?? (roomStarted ? "进行中" : "未开始"), complete:countdownComplete },
    { label:"每位在桌成员提交 1 条独立发言", progress:`${positionCount}/${discussionTarget}`, complete:positionsComplete },
    { label:"每位在桌成员至少回复另一人 1 次", progress:`${responseCount}/${discussionTarget}`, complete:responsesComplete },
  ];
  const viewerCanRead = viewerStatus === "active" || viewerStatus === "exited";

  return <aside className={`recap-conditions ${compact ? "is-compact" : ""}`} aria-label="开房与会后复盘条件">
    <div className="condition-card-heading"><div><span className="eyebrow">CLEAR GATES · 实时进度</span><h2>开房与会后复盘条件</h2></div><p>复盘条件 3 项必须同时完成。到期仍有缺项时不会跳过；补齐后，AI 主持才会按真实内容自动生成总结与 Perspective Map。</p></div>
    <div className="condition-groups"><ConditionList title="开房条件" eyebrow="BEFORE THE ROOM" items={opening}/><ConditionList title="复盘条件" eyebrow="ALL THREE REQUIRED" items={recap}/></div>
    <div className={`condition-generation ${recapReady ? "is-complete" : ""}`}><span aria-hidden="true">{recapReady ? "✓" : "→"}</span><p><strong>{recapReady ? "会后复盘已生成" : "全部达标后自动生成"}</strong>主持人：AI 主持。只负责流程提示与会后总结，不代替成员发言，也不裁定谁对谁错。{demoEnabled && " Demo/Test 的林澈只是演示导演，可推进模拟时间和重置，不是圆桌主持人。"}</p></div>
    <p className={`condition-access ${viewerCanRead ? "is-allowed" : ""}`}><strong>查看权限</strong>{viewerCanRead ? "你是本轮实际参与者，复盘生成后即可查看。" : "只有本轮实际参与者可以查看生成后的复盘。"}</p>
  </aside>;
}
