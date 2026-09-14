import type { Metadata } from "next";
import "@fontsource-variable/manrope";
import "@fontsource/ibm-plex-mono/400.css";
import "./globals.css";
import { DemoProvider } from "@/lib/demo/state";
import { DemoShell } from "@/components/demo-shell";

export const metadata: Metadata = {
  title: "CrossPoint / 交点",
  description: "先用标签找到值得聊的问题，再进入由互补视角组成的 12 小时异步聊天室。",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const demoEnabled = process.env.DEMO_MODE === "true";
  return <html lang="zh-CN" data-scroll-behavior="smooth"><body><a className="skip-link" href="#main-content">跳到主要内容</a><DemoProvider demoEnabled={demoEnabled}><DemoShell>{children}</DemoShell></DemoProvider></body></html>;
}
