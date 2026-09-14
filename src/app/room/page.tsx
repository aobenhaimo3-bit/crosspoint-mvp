"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Paperclip, X } from "lucide-react";
import { ArrowIcon } from "@/components/icons";
import { RecapConditions } from "@/components/recap-conditions";
import { personas, positionDrafts, type PersonaId } from "@/data/demo";
import {
  CHAT_IMAGE_MIME_TYPES,
  MAX_CHAT_IMAGE_BYTES,
  MAX_CHAT_IMAGES_PER_MESSAGE,
  getResponseTargetMessageId,
  type ChatImageAttachment,
  type ChatImageInput,
  type CrossResponse,
  type PositionCard,
} from "@/domain";
import { useDemo } from "@/lib/demo/state";
import type { SafePosition, SafeResponse } from "@/server/scenario";

const isPosition = (value: SafePosition): value is PositionCard => "judgment" in value;
const isResponse = (value: SafeResponse): value is CrossResponse => "content" in value;
const person = (id: string) => personas.find((item) => item.id === id);
const clock = (value?: string) => value ? new Date(value).toLocaleTimeString("zh-CN", { hour:"2-digit", minute:"2-digit", hour12:false }) : "刚刚";
const imageAccept = CHAT_IMAGE_MIME_TYPES.join(",");
type TimelineQuote = { id:string; authorId:string; text:string };
type TimelineMessage =
  | { id:string; kind:"position"; authorId:string; at:string; text:string; card:PositionCard }
  | { id:string; kind:"response"; authorId:string; at:string; text:string; response:CrossResponse; quote?:TimelineQuote };
function formatCountdown(milliseconds:number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  return `${String(hours).padStart(2,"0")}:${String(minutes).padStart(2,"0")}:${String(seconds % 60).padStart(2,"0")}`;
}
function useRoomCountdown(expiresAt?:string, virtualNow?:string) {
  const [effectiveNow, setEffectiveNow] = useState(() => virtualNow ? Date.parse(virtualNow) : Date.now());
  useEffect(() => {
    if (!virtualNow) return;
    const virtualAnchor = Date.parse(virtualNow);
    const wallAnchor = Date.now();
    const tick = () => setEffectiveNow(virtualAnchor + Date.now() - wallAnchor);
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [virtualNow]);
  return expiresAt ? formatCountdown(Date.parse(expiresAt) - effectiveNow) : "--:--:--";
}
function positionText(card: PositionCard) { return [card.judgment, ...card.reasons, ...card.evidence.map((x) => `证据：${x}`), ...card.uncertainties.map((x) => `还不确定：${x}`)].filter(Boolean); }
function readImage(file:File):Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("无法读取图片。"));
    reader.onerror = () => reject(new Error("无法读取图片。"));
    reader.readAsDataURL(file);
  });
}
function MessageImages({ images, authorName }:{ images:readonly ChatImageAttachment[] | undefined; authorName:string }) {
  if (!images?.length) return null;
  return <div className={`chat-image-grid count-${Math.min(images.length, 3)}`}>{images.map((image) => <figure key={image.id}>
    <Image unoptimized src={image.dataUrl} alt={`${authorName}发送的图片：${image.name}`} width={960} height={720}/>
    <figcaption>{image.name}</figcaption>
  </figure>)}</div>;
}

type DemoContext = ReturnType<typeof useDemo>;

export default function RoomPage() {
  const demo = useDemo();
  const currentId = demo.state?.viewer.personaId as PersonaId | undefined;
  const requestMatches = Boolean(currentId && demo.draftRequest?.personaId === currentId);
  const draft = currentId && requestMatches ? positionDrafts[currentId] : undefined;
  const initialComposer = draft ? `判断：${draft.judgment}\n理由：${draft.reason}\n证据：${draft.evidence}\n不确定：${draft.uncertainty}` : "";
  return <RoomContent key={`${currentId ?? "loading"}-${requestMatches ? demo.draftRequest?.sequence ?? 0 : 0}`} demo={demo} initialComposer={initialComposer}/>;
}

function RoomContent({ demo, initialComposer }: { demo:DemoContext; initialComposer:string }) {
  const { state, demoEnabled, loading, pending, error, action } = demo;
  const [composer, setComposer] = useState(initialComposer);
  const [replyTo, setReplyTo] = useState("");
  const [images, setImages] = useState<ChatImageInput[]>([]);
  const [imageError, setImageError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sendingRef = useRef(false);
  const currentId = state?.viewer.personaId as PersonaId | undefined;
  const current = currentId ? person(currentId) : undefined;
  const countdown = useRoomCountdown(state?.room.expiresAt, state?.virtualNow);

  const messages = useMemo<TimelineMessage[]>(() => {
    if (!state) return [];
    const positions = state.room.positions.filter(isPosition);
    const base: TimelineMessage[] = [
      ...positions.map((card):TimelineMessage => ({ id:card.id, kind:"position", authorId:card.authorId, at:card.submittedAt, text:card.judgment || (card.images?.length ? "[图片]" : ""), card })),
      ...state.room.responses.filter(isResponse).map((response):TimelineMessage => ({ id:response.id, kind:"response", authorId:response.authorId, at:response.submittedAt, text:response.content || (response.images?.length ? "[图片]" : ""), response })),
    ].sort((a,b) => Date.parse(a.at) - Date.parse(b.at));
    const byId = new Map(base.map((message) => [message.id, { id:message.id, authorId:message.authorId, text:message.text }]));
    return base.map((message) => message.kind === "response"
      ? { ...message, quote:byId.get(getResponseTargetMessageId(message.response) ?? "") }
      : message);
  }, [state]);

  if (loading || !state || !current) return <section className="blocked-state"><span className="eyebrow">SIGNED SESSION</span><h1>正在连接异步圆桌…</h1></section>;
  const { room } = state;
  if (!["INDEPENDENT","CROSS_RESPONSE","SYNTHESIS","ENDED"].includes(room.state)) return <section className="blocked-state"><span className="eyebrow">ROOM GATE</span><h1>圆桌还没开始。</h1><p>所有当前受邀者需要先明确接受或拒绝。{demoEnabled && "演示模式下仅演示导演可以推进模拟时间。"}</p><Link href="/match" className="primary-button">返回邀请页<ArrowIcon/></Link></section>;
  if (room.state === "ENDED") return <section className="blocked-state"><span className="eyebrow">ROOM ENDED</span><h1>这轮对话已收束。</h1><p>消息、图片与引用回应已保存在共享场景中。</p><div className="blocked-actions"><Link href="/summary" className="primary-button">查看会后总结<ArrowIcon/></Link><Link href="/discover" className="secondary-button">看看新聊天室</Link></div></section>;
  if (state.viewer.memberStatus !== "active") return <section className="blocked-state"><span className="eyebrow">PARTICIPATION GATE</span><h1>这个身份不在当前圆桌。</h1><p>未受邀、已拒绝或候补身份只能看到提交状态。</p><Link href="/match" className="secondary-button">查看邀请状态</Link></section>;

  const activeIds = room.members.filter((member) => member.status === "active").map((member) => member.userId);
  const ownPosition = room.positions.find((item) => item.authorId === current.id);
  const ownResponses = room.responses.filter(isResponse).filter((item) => item.authorId === current.id);
  const target = messages.find((item) => item.id === replyTo && item.authorId !== current.id);
  const repliedToTarget = Boolean(target && ownResponses.some((item) => getResponseTargetMessageId(item) === target.id));
  const inputClosed = room.state === "SYNTHESIS" || (room.state === "INDEPENDENT" && Boolean(ownPosition));
  const hasMessageContent = composer.trim().length > 0 || images.length > 0;
  const canSend = !pending && !inputClosed && !repliedToTarget && hasMessageContent && (room.state !== "CROSS_RESPONSE" || Boolean(target));

  async function send() {
    if (!canSend || sendingRef.current) return;
    sendingRef.current = true;
    try {
      const next = room.state === "INDEPENDENT"
        ? await action({ type:"submitPosition", content:composer.trim(), images })
        : await action({ type:"submitResponse", targetMessageId:replyTo, relation:"complementary", content:composer.trim(), images });
      if (next) { setComposer(""); setImages([]); setReplyTo(""); }
    } finally { sendingRef.current = false; }
  }
  async function addImages(files:FileList | null) {
    if (!files?.length) return;
    setImageError("");
    const capacity = MAX_CHAT_IMAGES_PER_MESSAGE - images.length;
    if (capacity <= 0) { setImageError(`每条消息最多上传 ${MAX_CHAT_IMAGES_PER_MESSAGE} 张图片。`); return; }
    const selected = Array.from(files).slice(0, capacity);
    if (files.length > capacity) setImageError(`已保留前 ${capacity} 张；每条消息最多 ${MAX_CHAT_IMAGES_PER_MESSAGE} 张。`);
    const accepted:ChatImageInput[] = [];
    for (const file of selected) {
      if (!CHAT_IMAGE_MIME_TYPES.includes(file.type as (typeof CHAT_IMAGE_MIME_TYPES)[number])) { setImageError("仅支持 PNG、JPG、WebP 和 GIF 图片。"); continue; }
      if (file.size > MAX_CHAT_IMAGE_BYTES) { setImageError(`${file.name} 超过 2 MB。`); continue; }
      try { accepted.push({ name:file.name, dataUrl:await readImage(file) }); }
      catch (cause) { setImageError(cause instanceof Error ? cause.message : "无法读取图片。"); }
    }
    if (accepted.length) setImages((current) => [...current, ...accepted].slice(0, MAX_CHAT_IMAGES_PER_MESSAGE));
  }
  function removeImage(index:number) { setImages((current) => current.filter((_, itemIndex) => itemIndex !== index)); setImageError(""); }
  function onComposerKeyDown(event:KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || !canSend) return;
    event.preventDefault();
    void send();
  }
  function focusComposer() { window.requestAnimationFrame(() => document.getElementById("room-composer")?.focus()); }
  function beginReply(messageId:string) { setReplyTo(messageId); focusComposer(); }
  function cancelReply() { setReplyTo(""); focusComposer(); }
  async function exitRoom() { await action({ type:"exit" }); }

  return <main className="chat-room-layout">
    <header className="chat-room-header"><div className="chat-topic"><span className="eyebrow">CROSSPOINT 异步圆桌</span><h1>{state.discussionSpec.question}</h1><p>不必同时在线。复盘将在 12 小时归零且全员完成发言与回应后解锁；AI 主持只负责流程提示与自动总结。</p></div><div className="chat-room-meta"><div className="chat-room-clock" aria-label={`剩余 ${countdown}`}><span>本轮剩余</span><strong>{countdown}</strong><small>{activeIds.length} 人在桌 · {room.state === "INDEPENDENT" ? "独立发言" : room.state === "CROSS_RESPONSE" ? "自由回复" : "AI 主持收束"}</small></div><button className="exit-control" disabled={pending} onClick={() => void exitRoom()}>退出本轮</button></div></header>
    <RecapConditions room={room} viewerStatus={state.viewer.memberStatus} virtualNow={state.virtualNow} countdownLabel={countdown} demoEnabled={demoEnabled}/>
    <section className="chat-timeline" aria-label="圆桌消息流" aria-live="polite">
      <div className="chat-system-message"><strong>AI 主持</strong><p>{room.state === "INDEPENDENT" ? "独立阶段已开始。在所有人提交前，你只能看到自己的内容和他人的提交状态。" : room.state === "CROSS_RESPONSE" ? "所有独立发言已公开。现在可以回复任意一条他人消息；每次只引用直接上文，同一条消息每人回复一次。" : "12 小时已经结束，且所有在桌成员已完成发言与回应。AI 主持正在根据本轮真实内容自动生成复盘。"}</p></div>
      {room.state === "INDEPENDENT" && activeIds.filter((id) => id !== current.id).map((id) => <div className="chat-system-message compact" key={id}><span>{person(id)?.name ?? id}</span><p>{room.positions.some((item) => item.authorId === id) ? "已提交首条发言 · 内容暂时隐藏" : "正在思考…"}</p></div>)}
      {messages.map((message) => {
        const author = person(message.authorId);
        const mine = message.authorId === current.id;
        const alreadyReplied = ownResponses.some((item) => getResponseTargetMessageId(item) === message.id);
        const replyLabel = `${alreadyReplied ? "已回复" : "回复"} ${author?.name ?? message.authorId}：${message.text.slice(0, 32)}`;
        const attachedImages = message.kind === "position" ? message.card.images : message.response.images;
        return <article className={`chat-message ${mine ? "is-mine" : ""}`} key={message.id}>
          <div className={`chat-avatar persona-${author?.color ?? "cyan"}`} aria-hidden="true">{author?.name[0] ?? "?"}</div>
          <div className="chat-message-body">
            <header><strong>{mine ? "我" : author?.name ?? message.authorId}</strong><span>{author?.role}</span><time dateTime={message.at}>{clock(message.at)}</time></header>
            {message.kind === "response" && message.quote && <blockquote className="chat-quote"><strong>回复 {person(message.quote.authorId)?.name ?? message.quote.authorId}</strong><span>{message.quote.text}</span></blockquote>}
            <div className={`chat-bubble ${attachedImages?.length ? "has-images" : ""}`}>
              {message.kind === "position" ? positionText(message.card).map((line,index) => <p key={index}>{line}</p>) : message.response.content ? <p>{message.response.content}</p> : null}
              <MessageImages images={attachedImages} authorName={author?.name ?? message.authorId}/>
            </div>
            {room.state === "CROSS_RESPONSE" && !mine && <button disabled={alreadyReplied} className="chat-reply-action" aria-label={replyLabel} onClick={() => beginReply(message.id)}>↩ {alreadyReplied ? "已回复" : "回复"}</button>}
          </div>
        </article>;
      })}
      {room.state === "SYNTHESIS" && <div className="chat-system-message synthesis"><strong>AI 主持 · 自动总结中</strong><p>已收集 {room.positions.length} 条首发和 {room.responses.length} 条引用回应。复盘只从这些真实提交生成，无需任何成员确认。</p></div>}
    </section>
    <footer className="chat-composer-dock">
      {target && <div className="composer-quote" role="status" aria-live="polite"><span>正在回复 {person(target.authorId)?.name ?? target.authorId}</span><p>{target.text}</p><button aria-label="取消回复" onClick={cancelReply}>×</button></div>}
      {images.length > 0 && <div className="composer-image-tray" aria-label="待发送图片">{images.map((image,index) => <figure key={`${image.name ?? "image"}-${index}`}><Image unoptimized src={image.dataUrl} alt={`待发送：${image.name ?? `图片 ${index + 1}`}`} width={180} height={135}/><figcaption>{image.name ?? `图片 ${index + 1}`}</figcaption><button type="button" aria-label={`移除图片 ${image.name ?? index + 1}`} onClick={() => removeImage(index)}><X size={14}/></button></figure>)}</div>}
      <label className="sr-only" htmlFor="room-composer">输入发言</label><div className="chat-composer-row">
        <input ref={fileInputRef} className="sr-only" type="file" multiple accept={imageAccept} onChange={(event) => { void addImages(event.target.files); event.currentTarget.value = ""; }}/>
        <button type="button" className="chat-attach-button" aria-label="添加图片" title="添加图片" disabled={inputClosed || pending || images.length >= MAX_CHAT_IMAGES_PER_MESSAGE} onClick={() => fileInputRef.current?.click()}><Paperclip size={20}/></button>
        <textarea id="room-composer" aria-describedby="composer-help" value={composer} onChange={(event) => setComposer(event.target.value)} onKeyDown={onComposerKeyDown} disabled={inputClosed} placeholder={room.state === "INDEPENDENT" ? "直接说说你现在怎么看这个问题…" : room.state === "CROSS_RESPONSE" ? target ? `回复 ${person(target.authorId)?.name ?? target.authorId}…` : "先选择一条消息，再写下你的回复…" : "这轮发言已结束"}/><button className="chat-send-button" disabled={!canSend} onClick={() => void send()} aria-label="发送消息">发送 <ArrowIcon/></button>
      </div>
      <div className="composer-status" id="composer-help"><span>{repliedToTarget ? "你已经回复过这条消息，可选择另一条" : inputClosed ? "本阶段输入已关闭" : room.state === "INDEPENDENT" ? "Enter 发送 · Shift + Enter 换行 · 可附 3 张图片" : target ? "只引用这条直接上文 · Enter 发送 · Shift + Enter 换行" : "请先点击任意一条他人消息下的“回复”"}</span><span>{composer.length} 字{images.length ? ` · ${images.length} 图` : ""}</span></div>
      {imageError && <p className="attachment-error" role="alert">{imageError}</p>}
      {error && <p className="action-error" role="alert">{error}</p>}
    </footer>
  </main>;
}
