import Link from "next/link";
import { ArrowIcon } from "@/components/icons";
import { SourceBadge } from "@/components/source-badge";

export default function HomePage() {
  return <div className="home-layout home-chat-entry">
    <section className="question-hero profile-first-hero" aria-labelledby="home-title">
      <div className="hero-meta"><SourceBadge>知乎灵感 · 真人异步圆桌</SourceBadge><span>3–5 人 · 开放 12 小时</span></div>
      <p className="kicker">先让我们认识你的好奇心，再把对的人带进同一段对话。</p>
      <h1 id="home-title">不是先挑一道题。<br/>先说说你关心什么。</h1>
      <p className="hero-copy">用几组可编辑标签写下你的兴趣、能贡献的经验和想遇见的视角。CrossPoint 会据此推荐知乎上的 AI 社会议题，再从相关且互补的人中随机组成圆桌。</p>
      <div className="conversation-preview" aria-label="匹配形成对话的过程">
        <div className="chat-bubble chat-bubble-self"><span>我的标签</span><p>未来工作 · 商业观察 · 想理解技术边界</p></div>
        <div className="chat-bubble chat-bubble-system"><span>CrossPoint</span><p>找到 3 个适合你参与的开放问题</p></div>
      </div>
      <Link className="primary-button hero-button" href="/onboarding">先设定我的标签 <ArrowIcon /></Link>
      <p className="microcopy">没有人员目录，也不能点选成员；你只选择问题，系统在满足约束的候选中组桌。</p>
    </section>
    <aside className="hero-visual matching-postcard" aria-label="从标签到异步圆桌">
      <p className="plot-label"><span aria-hidden="true">●</span> 一场对话如何发生</p>
      <ol className="chat-flow-list">
        <li><span>1</span><div><strong>写下你的标签</strong><p>兴趣、贡献、想了解、希望遇见的视角</p></div></li>
        <li><span>2</span><div><strong>从 3 个问题里选择</strong><p>开放的社会问题，不做正反辩论</p></div></li>
        <li><span>3</span><div><strong>等待互补的人入席</strong><p>商科、计算机、哲学与社会学等视角交叉</p></div></li>
        <li><span>12h</span><div><strong>错开时间，也能好好聊</strong><p>聊天室持续开放，回来就能接着上下文说</p></div></li>
      </ol>
    </aside>
    <section className="principle-strip" aria-label="CrossPoint 工作方式">
      <div><span>标签</span><strong>你先定义自己</strong><p>所有用于匹配的标签都可见、可改、由你确认。</p></div>
      <div><span>问题</span><strong>知乎公共议题</strong><p>推荐值得共同探究的问题，不制造输赢。</p></div>
      <div><span>组桌</span><strong>相关且互补</strong><p>先满足约束，再稳定抽签；不把人做成排行榜。</p></div>
    </section>
  </div>;
}
