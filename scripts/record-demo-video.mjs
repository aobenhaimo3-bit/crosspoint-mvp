import { chromium } from "@playwright/test";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const BASE_URL = process.env.CROSSPOINT_VIDEO_BASE_URL || "https://crosspoint-mvp-production.up.railway.app";
const root = process.cwd();
const outputDirectory = path.resolve(root, "artifacts", "video");
const rawDirectory = path.join(outputDirectory, "raw");
const coverPath = path.resolve(root, "docs", "images", "cover.png");
const outputPath = path.join(outputDirectory, "crosspoint-demo-raw.webm");
const viewport = { width: 1440, height: 810 };
const mainQuestion = "AI 进入工作流后，我们怎样重新定义一份值得投入的工作？";

const roles = {
  finance: "商科学生",
  computer: "计算机专业学生",
  recruiter: "哲学研究生",
  educator: "社会学研究者",
  practitioner: "AI 产品实践者",
};

const replies = {
  practitioner: { target: "林澈", content: "产品实践里，关键不是少做判断，而是让判断进入可追踪的反馈与升级路径。" },
  finance: { target: "许舟", content: "同意。企业应把自主权写进流程，让成员不仅为结果负责，也能质疑目标本身。" },
  recruiter: { target: "陈知遥", content: "保障决定了选择是否真实；没有拒绝权，所谓有意义的工作很容易成为口号。" },
  educator: { target: "顾言", content: "人工复核还要回答谁有时间和资源参与，不能把新的责任继续转嫁给个人。" },
};

function locateChromium() {
  if (process.env.CROSSPOINT_VIDEO_CHROME) return process.env.CROSSPOINT_VIDEO_CHROME;
  const browserRoot = path.join(process.env.LOCALAPPDATA || "", "ms-playwright");
  const candidates = readdirSync(browserRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("chromium-"))
    .map((entry) => path.join(browserRoot, entry.name, "chrome-win64", "chrome.exe"))
    .filter(existsSync)
    .sort()
    .reverse();
  if (!candidates[0]) throw new Error("No Playwright Chromium installation was found.");
  return candidates[0];
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function installFilmLayer(page) {
  await page.evaluate(() => {
    if (document.getElementById("crosspoint-film-layer")) return;
    const style = document.createElement("style");
    style.id = "crosspoint-film-style";
    style.textContent = `
      #crosspoint-film-layer { position: fixed; inset: 0; z-index: 2147483646; pointer-events: none; font-family: "Microsoft YaHei", "Noto Sans SC", sans-serif; }
      #crosspoint-film-caption { position: absolute; left: 36px; bottom: 34px; width: min(610px, calc(100vw - 72px)); padding: 17px 21px 18px; color: white; background: rgba(12, 35, 68, .90); border: 1px solid rgba(130, 180, 255, .42); border-radius: 16px; box-shadow: 0 18px 55px rgba(4, 23, 50, .24); backdrop-filter: blur(16px); opacity: 0; transform: translateY(15px); transition: opacity .28s ease, transform .28s ease; }
      #crosspoint-film-caption.visible { opacity: 1; transform: translateY(0); }
      #crosspoint-film-caption strong { display: block; font-size: 22px; line-height: 1.35; letter-spacing: .01em; }
      #crosspoint-film-caption span { display: block; margin-top: 6px; color: #d7e7ff; font-size: 14px; line-height: 1.6; }
      #crosspoint-film-cursor { position: absolute; width: 24px; height: 24px; margin: -12px 0 0 -12px; border: 3px solid white; border-radius: 999px; background: #1677ff; box-shadow: 0 2px 12px rgba(10, 51, 108, .45); opacity: 0; transition: left .28s ease, top .28s ease, transform .16s ease, opacity .2s ease; }
      #crosspoint-film-cursor.visible { opacity: .96; }
      #crosspoint-film-cursor.press { transform: scale(.72); }
      #crosspoint-film-outro { position: absolute; inset: 0; display: none; place-items: center; color: #0b2a56; background: radial-gradient(circle at 50% 40%, #ffffff 0%, #edf5ff 55%, #dcecff 100%); text-align: center; }
      #crosspoint-film-outro.visible { display: grid; }
      #crosspoint-film-outro .mark { margin: 0 auto 28px; width: 76px; height: 76px; display: grid; place-items: center; color: white; background: #1677ff; border-radius: 22px; font-size: 48px; font-weight: 300; box-shadow: 0 18px 45px rgba(22,119,255,.25); }
      #crosspoint-film-outro h1 { margin: 0; font-size: 58px; letter-spacing: -.04em; }
      #crosspoint-film-outro p { margin: 18px 0 24px; font-size: 24px; color: #48627f; }
      #crosspoint-film-outro code { display: inline-block; padding: 12px 20px; color: #1267d5; background: white; border: 1px solid #bad5fb; border-radius: 999px; font-size: 18px; }
    `;
    document.head.append(style);
    const layer = document.createElement("div");
    layer.id = "crosspoint-film-layer";
    layer.innerHTML = `
      <div id="crosspoint-film-caption"><strong></strong><span></span></div>
      <div id="crosspoint-film-cursor"></div>
      <div id="crosspoint-film-outro"><div><div class="mark">＋</div><h1>CrossPoint 交点</h1><p>先因问题相遇，再因观点连接</p><code>crosspoint-mvp-production.up.railway.app</code></div></div>
    `;
    document.body.append(layer);
  });
}

async function showCaption(page, title, detail, hold = 950) {
  await installFilmLayer(page);
  await page.evaluate(({ nextTitle, nextDetail }) => {
    const caption = document.getElementById("crosspoint-film-caption");
    caption.querySelector("strong").textContent = nextTitle;
    caption.querySelector("span").textContent = nextDetail;
    caption.classList.add("visible");
  }, { nextTitle: title, nextDetail: detail });
  await sleep(hold);
}

async function hideCaption(page) {
  await page.evaluate(() => document.getElementById("crosspoint-film-caption")?.classList.remove("visible"));
  await sleep(260);
}

async function pointAt(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error("Could not determine the target position for the film cursor.");
  await installFilmLayer(page);
  await page.evaluate(({ x, y }) => {
    const cursor = document.getElementById("crosspoint-film-cursor");
    cursor.style.left = `${x}px`;
    cursor.style.top = `${y}px`;
    cursor.classList.add("visible");
  }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  await sleep(360);
}

async function clickForFilm(page, locator, pause = 560) {
  await locator.waitFor({ state: "visible", timeout: 20_000 });
  await pointAt(page, locator);
  await page.evaluate(() => document.getElementById("crosspoint-film-cursor")?.classList.add("press"));
  await sleep(120);
  await locator.click();
  await page.evaluate(() => document.getElementById("crosspoint-film-cursor")?.classList.remove("press")).catch(() => undefined);
  await sleep(pause);
}

async function openDirector(page) {
  const trigger = page.getByRole("button", { name: /签名 DEMO 身份/ });
  await clickForFilm(page, trigger, 360);
  const dialog = page.getByRole("dialog", { name: "演示导演台" });
  await dialog.waitFor({ state: "visible", timeout: 15_000 });
  return dialog;
}

async function switchIdentity(page, role) {
  const dialog = await openDirector(page);
  await clickForFilm(page, dialog.getByRole("button", { name: new RegExp(role) }), 700);
  await page.getByRole("button", { name: /签名 DEMO 身份/ }).filter({ hasText: role }).waitFor({ state: "visible", timeout: 15_000 });
}

async function resetScenario(context) {
  const page = await context.newPage();
  try {
    await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const trigger = page.getByRole("button", { name: /签名 DEMO 身份/ });
    await trigger.waitFor({ state: "visible", timeout: 20_000 });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "演示导演台" });
    await dialog.waitFor({ state: "visible" });
    page.once("dialog", (confirmation) => confirmation.accept());
    await dialog.getByRole("button", { name: "重置共享演示场景" }).click();
    await page.waitForURL(`${BASE_URL}/`, { timeout: 20_000 });
  } finally {
    await page.close();
  }
}

async function completeProfile(page) {
  const tagGroup = (legend) => page.locator("fieldset.tag-group").filter({ has: page.locator("legend", { hasText: legend }) });
  const interests = tagGroup("我感兴趣");
  await clickForFilm(page, interests.getByRole("tabpanel").getByRole("button", { name: "人工智能", exact: true }), 260);
  await clickForFilm(page, interests.getByRole("tab", { name: /^商业与产业/ }), 220);
  await clickForFilm(page, interests.getByRole("tabpanel").getByRole("button", { name: "组织管理", exact: true }), 260);
  await clickForFilm(page, interests.getByRole("tab", { name: /^职业与劳动/ }), 220);
  await clickForFilm(page, interests.getByRole("tabpanel").getByRole("button", { name: "就业", exact: true }), 220);
  await clickForFilm(page, interests.getByRole("tabpanel").getByRole("button", { name: "未来工作", exact: true }), 500);

  const roleSelect = page.getByLabel(/我从哪里出发/);
  await roleSelect.scrollIntoViewIfNeeded();
  await roleSelect.selectOption({ label: "商科 / 组织" });
  await sleep(450);
  for (const label of ["商业与组织视角", "个人经历"]) {
    await clickForFilm(page, tagGroup("我能贡献").getByRole("button", { name: new RegExp(label) }), 220);
  }
  for (const label of ["技术实践视角", "人文与伦理视角"]) {
    await clickForFilm(page, tagGroup("我想了解").getByRole("button", { name: new RegExp(label) }), 220);
  }
  await clickForFilm(page, tagGroup("我希望遇见").getByRole("button", { name: /社会结构视角/ }), 350);

  const saveResponse = page.waitForResponse((response) => response.url().includes("/actions") && response.request().postData()?.includes('"type":"saveProfile"'));
  await clickForFilm(page, page.getByRole("button", { name: /根据标签推荐问题/ }), 350);
  if ((await saveResponse).status() !== 200) throw new Error("Profile submission failed.");
  await page.getByRole("heading", { name: mainQuestion }).waitFor({ state: "visible", timeout: 20_000 });
}

async function acceptCurrentInvite(page) {
  const response = page.waitForResponse((candidate) => candidate.url().includes("/actions") && candidate.request().postData()?.includes('"type":"accept"'));
  await clickForFilm(page, page.getByRole("button", { name: /接受邀请/ }), 500);
  if ((await response).status() !== 200) throw new Error("Invite acceptance failed.");
}

async function fillDraftAndSend(page, role) {
  await switchIdentity(page, role);
  const dialog = await openDirector(page);
  await clickForFilm(page, dialog.getByRole("button", { name: "填入当前身份聊天草稿" }), 520);
  const composer = page.getByLabel("输入发言");
  await composer.waitFor({ state: "visible", timeout: 15_000 });
  await page.waitForFunction(() => document.querySelector("#room-composer")?.value?.length > 20);
  await pointAt(page, composer);
  await sleep(420);
  const response = page.waitForResponse((candidate) => candidate.url().includes("/actions") && candidate.request().postData()?.includes('"type":"submitPosition"'));
  await composer.press("Enter");
  if ((await response).status() !== 200) throw new Error(`Opening submission failed for ${role}.`);
  await sleep(650);
}

async function submitReply(page, actorId) {
  const { target, content } = replies[actorId];
  await switchIdentity(page, roles[actorId]);
  const card = page.locator("article.chat-message").filter({
    has: page.locator("header strong", { hasText: target }),
  }).first();
  await card.waitFor({ state: "visible", timeout: 15_000 });
  const replyButton = card.getByRole("button", { name: new RegExp(`^回复 ${target}`) });
  await clickForFilm(page, replyButton, 340);
  const composer = page.getByLabel("输入发言");
  await composer.fill(content);
  await sleep(650);
  const response = page.waitForResponse((candidate) => candidate.url().includes("/actions") && candidate.request().postData()?.includes('"type":"submitResponse"'));
  await composer.press("Enter");
  if ((await response).status() !== 200) throw new Error(`Cross response failed for ${actorId}.`);
  await sleep(600);
}

async function recordFlow(browser) {
  mkdirSync(rawDirectory, { recursive: true });
  const context = await browser.newContext({
    viewport,
    colorScheme: "light",
    locale: "zh-CN",
    recordVideo: { dir: rawDirectory, size: viewport },
  });
  const page = await context.newPage();
  const video = page.video();
  page.setDefaultTimeout(20_000);

  try {
    const cover = readFileSync(coverPath).toString("base64");
    await page.setContent(`<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#f7f8fa}img{width:100%;height:100%;object-fit:cover}</style><img alt="CrossPoint 交点" src="data:image/png;base64,${cover}">`);
    await sleep(3_600);

    await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.getByRole("heading", { name: /不是先挑一道题/ }).waitFor({ state: "visible", timeout: 20_000 });
    await showCaption(page, "先定义自己的好奇心", "CrossPoint 先读取用户确认的标签，再匹配真正值得讨论的问题。", 1_350);
    await sleep(1_150);
    await clickForFilm(page, page.getByRole("link", { name: /先设定我的标签/ }), 500);

    await page.getByRole("group", { name: /我感兴趣/ }).waitFor({ state: "visible" });
    await showCaption(page, "01 · 标签画像", "兴趣可以跨六大类多选；贡献、学习目标和期待视角分别建模。", 1_050);
    await completeProfile(page);
    await showCaption(page, "标签筛出问题，而不是直接挑人", "系统推荐知乎 AI 社会议题；用户只选择问题，算法负责互补组桌。", 1_150);
    const questionCard = page.locator("article.recommended-question-card").filter({ has: page.getByRole("heading", { name: mainQuestion }) });
    await sleep(900);
    const chooseResponse = page.waitForResponse((response) => response.url().includes("/actions") && response.request().postData()?.includes('"type":"chooseQuestion"'));
    await clickForFilm(page, questionCard.getByRole("button", { name: /选择这个问题/ }), 480);
    if ((await chooseResponse).status() !== 200) throw new Error("Question selection failed.");
    await page.waitForURL(/\/match$/, { timeout: 20_000 });

    await showCaption(page, "02 · 相关且互补的随机圆桌", "商科、计算机、哲学和社会学先满足约束，再由场景稳定抽签组成。", 1_150);
    await page.locator(".sample-message-stream").scrollIntoViewIfNeeded();
    await sleep(1_200);
    await acceptCurrentInvite(page);
    await switchIdentity(page, roles.recruiter);
    await acceptCurrentInvite(page);
    await switchIdentity(page, roles.educator);
    await acceptCurrentInvite(page);
    await switchIdentity(page, roles.finance);

    const timeoutDirector = await openDirector(page);
    await showCaption(page, "真实演示超时递补", "周屿未响应；推进模拟时间只触发服务端时钟，不会越过房间门禁。", 1_200);
    const timeResponse = page.waitForResponse((response) => response.url().includes("/actions") && response.request().postData()?.includes('"type":"advanceTime"'));
    await clickForFilm(page, timeoutDirector.getByRole("button", { name: /推进模拟时间 \+12 小时/ }), 500);
    if ((await timeResponse).status() !== 200) throw new Error("Invite timeout simulation failed.");
    await timeoutDirector.getByRole("button", { name: /计算机专业学生.*timed_out/ }).waitFor({ state: "visible", timeout: 15_000 });
    await timeoutDirector.getByRole("button", { name: /AI 产品实践者.*invited/ }).waitFor({ state: "visible", timeout: 15_000 });
    await sleep(1_050);
    await clickForFilm(page, timeoutDirector.getByRole("button", { name: /AI 产品实践者/ }), 650);
    await acceptCurrentInvite(page);
    await switchIdentity(page, roles.finance);
    await page.getByText("聊天室可以开放").waitFor({ state: "visible", timeout: 15_000 });
    await showCaption(page, "至少三人接受，且邀请全部处理", "只有条件完整满足，已接受成员才能打开 12 小时聊天室。", 1_050);
    const startResponse = page.waitForResponse((response) => response.url().includes("/actions") && response.request().postData()?.includes('"type":"start"'));
    await clickForFilm(page, page.getByRole("button", { name: /打开 12 小时聊天室/ }), 500);
    if ((await startResponse).status() !== 200) throw new Error("Room start failed.");
    await page.waitForURL(/\/room$/, { timeout: 20_000 });

    await page.getByText("本轮剩余").waitFor({ state: "visible" });
    await showCaption(page, "03 · 12 小时异步聊天室", "成员无需同时在线。倒计时精确到秒，消息、图片和引用关系持续保存。", 1_350);
    await sleep(900);
    await fillDraftAndSend(page, roles.finance);
    await showCaption(page, "独立表达阶段", "提交后只能看到自己的内容与他人的提交状态，避免观点互相锚定。", 1_050);
    await fillDraftAndSend(page, roles.recruiter);
    await fillDraftAndSend(page, roles.educator);
    await fillDraftAndSend(page, roles.practitioner);
    await page.getByText("所有独立发言已公开").waitFor({ state: "visible", timeout: 15_000 });
    await showCaption(page, "全员首发后，消息自动公开", "现在进入自由回复阶段，每条回应都引用明确的直接上文。", 1_200);
    await page.locator(".chat-timeline").evaluate((node) => { node.scrollTop = 0; });
    await sleep(950);

    await submitReply(page, "practitioner");
    await submitReply(page, "finance");
    await showCaption(page, "引用回复让多人聊天不再混乱", "回复关系被服务端保存，刷新页面后仍能恢复上下文。", 1_100);
    await submitReply(page, "recruiter");
    await submitReply(page, "educator");
    await switchIdentity(page, roles.finance);

    const closeDirector = await openDirector(page);
    await showCaption(page, "阶段门禁全部满足", "四位成员都完成首发和跨成员回应；12 小时结束后才会自动复盘。", 1_200);
    const closeResponse = page.waitForResponse((response) => response.url().includes("/actions") && response.request().postData()?.includes('"type":"advanceTime"'));
    await clickForFilm(page, closeDirector.getByRole("button", { name: /推进模拟时间 \+12 小时/ }), 500);
    if ((await closeResponse).status() !== 200) throw new Error("Room close simulation failed.");
    await clickForFilm(page, closeDirector.getByRole("button", { name: "关闭演示导演台" }), 350);
    await page.getByRole("heading", { name: "这轮对话已收束。" }).waitFor({ state: "visible", timeout: 20_000 });
    await sleep(800);
    await clickForFilm(page, page.getByRole("link", { name: /查看会后总结/ }), 480);

    await page.getByText(/PERSPECTIVE MAP · 4 个真实提交节点/).waitFor({ state: "visible", timeout: 20_000 });
    await showCaption(page, "04 · 动态 Perspective Map", "总结来自本轮真实消息，呈现共识、核心分歧、证据缺口与认知空位。", 1_350);
    await page.locator(".map-panel").scrollIntoViewIfNeeded();
    await sleep(1_350);
    await page.locator(".summary-notes").scrollIntoViewIfNeeded();
    await sleep(1_400);

    const recruiterCard = page.locator("article.peer-feedback-card").filter({ hasText: "许舟" });
    await recruiterCard.scrollIntoViewIfNeeded();
    await showCaption(page, "05 · 先聊过，再决定是否连接", "私密评分改善后续匹配；只有双方同意，才交换虚构 Test 知乎号。", 1_150);
    await recruiterCard.locator('input[type="range"]').nth(0).fill("5");
    await recruiterCard.locator('input[type="range"]').nth(1).fill("5");
    await recruiterCard.getByLabel("可选短评").fill("观点清晰，也愿意回应他人的不确定性。");
    await sleep(700);
    await clickForFilm(page, recruiterCard.getByRole("button", { name: "提交私密评价" }), 520);
    await clickForFilm(page, recruiterCard.getByRole("button", { name: /想继续聊 \/ 交换知乎号/ }), 650);
    await switchIdentity(page, roles.recruiter);
    const financeCard = page.locator("article.peer-feedback-card").filter({ hasText: "林澈" });
    await financeCard.scrollIntoViewIfNeeded();
    await clickForFilm(page, financeCard.getByRole("button", { name: "同意交换" }), 750);
    await financeCard.getByText("demo_finance", { exact: true }).waitFor({ state: "visible", timeout: 15_000 });
    await sleep(900);

    await page.goto(`${BASE_URL}/discover`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.getByRole("heading", { name: "为你匹配的新聊天室" }).waitFor({ state: "visible", timeout: 20_000 });
    await showCaption(page, "06 · 把反馈带进下一轮", "算法结合标签、认知空位和适聊反馈推荐新圆桌；刷新设有五分钟冷却。", 1_250);
    await page.locator(".next-room-list").scrollIntoViewIfNeeded();
    await sleep(1_100);
    const refreshButton = page.getByRole("button", { name: "换一批聊天室" });
    await clickForFilm(page, refreshButton, 650);
    await page.getByRole("button", { name: /换一批聊天室，\d{2}:\d{2} 后可刷新/ }).waitFor({ state: "visible", timeout: 15_000 });
    await sleep(1_200);

    await hideCaption(page);
    await installFilmLayer(page);
    await page.evaluate(() => document.getElementById("crosspoint-film-outro")?.classList.add("visible"));
    await sleep(4_300);
  } catch (error) {
    await page.screenshot({ path: path.join(outputDirectory, "record-failure.png"), fullPage: true }).catch(() => undefined);
    throw error;
  } finally {
    await page.close();
    await context.close();
  }

  const recordedPath = await video.path();
  copyFileSync(recordedPath, outputPath);
  return outputPath;
}

mkdirSync(outputDirectory, { recursive: true });
const executablePath = locateChromium();
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--font-render-hinting=none", "--disable-dev-shm-usage"],
});

try {
  const setupContext = await browser.newContext({ viewport, locale: "zh-CN" });
  await resetScenario(setupContext);
  await setupContext.close();

  const rawPath = await recordFlow(browser);

  const cleanupContext = await browser.newContext({ viewport, locale: "zh-CN" });
  await resetScenario(cleanupContext);
  await cleanupContext.close();

  process.stdout.write(`${rawPath}\n`);
} finally {
  await browser.close();
}
