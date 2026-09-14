import { personas, type PersonaId } from "@/data/demo";
import type { InviteState } from "@/lib/demo/state";

type Props = {
  invites?: Record<PersonaId, InviteState>;
  participantIds?: readonly PersonaId[];
  vacancyLabels?: readonly string[];
  question?: string;
  questionShort?: string;
  compact?: boolean;
  mapMode?: boolean;
  mapNodes?: readonly { userId: string; judgment: string }[];
  mapEdges?: readonly { fromUserId: string; toUserId: string; relation: "different" | "complementary" }[];
};

const coordsByCount: Record<number, number[][]> = {
  3: [[50,7],[82,66],[18,66]],
  4: [[50,7],[84,45],[50,82],[16,45]],
  5: [[50,7],[84,30],[75,76],[25,76],[16,30]],
  6: [[50,7],[82,25],[82,66],[50,82],[18,66],[18,25]],
};

export function Roundtable({ invites, participantIds = personas.slice(0,5).map((p) => p.id), vacancyLabels = ["机会公平"], question = "AI 进入工作流后，我们怎样重新定义一份值得投入的工作？", questionShort, compact = false, mapMode = false, mapNodes = [], mapEdges = [] }: Props) {
  const participants = participantIds.map((id) => personas.find((persona) => persona.id === id)).filter((persona): persona is (typeof personas)[number] => Boolean(persona));
  const vacancies = vacancyLabels.slice(0, Math.max(0, 6 - participants.length));
  const nodes = [...participants.map((persona) => ({ persona, vacancy: false, label: "" })), ...vacancies.map((label) => ({ persona: null, vacancy: true, label }))];
  const coords = coordsByCount[nodes.length] ?? coordsByCount[6];
  const coreLabel = questionShort ?? (question.length > 14 ? `${question.slice(0, 13)}…` : question);
  return <figure className={`roundtable ${compact ? "compact" : ""} ${mapMode ? "map-mode" : ""}`} aria-labelledby="roundtable-title">
    <div className="roundtable-field" aria-hidden="true">
      <svg className="roundtable-lines" viewBox="0 0 100 88" preserveAspectRatio="none">
        <ellipse cx="50" cy="44" rx="33" ry="31" />
        <path d="M50 7 75 76 16 30 84 30 25 76Z" />
        {mapMode && mapEdges.map((edge,index) => {
          const fromIndex = participants.findIndex((persona) => persona.id === edge.fromUserId);
          const toIndex = participants.findIndex((persona) => persona.id === edge.toUserId);
          if (fromIndex < 0 || toIndex < 0) return null;
          const from = coords[fromIndex]; const to = coords[toIndex];
          return <line key={`${edge.fromUserId}-${edge.toUserId}-${index}`} className={edge.relation === "different" ? "disagree" : "evidence"} x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]}/>;
        })}
      </svg>
      <div className="question-core"><span>本轮问题</span><strong>{coreLabel}</strong><i className="intersection">＋</i></div>
      {nodes.map(({ persona, vacancy, label }, index) => {
        const status = persona ? invites?.[persona.id] ?? "accepted" : "waiting";
        const submittedNode = persona ? mapNodes.find((node) => node.userId === persona.id) : undefined;
        const submittedLabel = submittedNode?.judgment && submittedNode.judgment.length > 28 ? `${submittedNode.judgment.slice(0,27)}…` : submittedNode?.judgment;
        return <div key={persona?.id ?? `vacancy-${label}`} className={`perspective-node ${persona ? `node-${persona.color}` : ""} status-${status} ${vacancy ? "vacancy" : ""}`} style={{ left: `${coords[index][0]}%`, top: `${coords[index][1]}%` }}>
          <span>{vacancy ? "认知空位" : persona?.role}</span><small title={submittedNode?.judgment}>{vacancy ? label : mapMode && submittedLabel ? submittedLabel : persona?.contributes[0]}</small>
        </div>;
      })}
    </div>
    <figcaption id="roundtable-title" className="sr-only">围绕“{question}”的互补视角圆桌；实线为已覆盖视角，虚线为认知空位。</figcaption>
    <ul className="sr-only">{participants.map((p) => <li key={p.id}>{p.role}：{p.contributes.join("、")}</li>)}{vacancies.map((label) => <li key={label}>认知空位：{label}</li>)}</ul>
  </figure>;
}
