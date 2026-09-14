import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";

type PersonaId = "finance" | "computer" | "recruiter" | "educator" | "practitioner";
type Actor = { id: PersonaId; role: string; page: Page; opening: string };

const SCENARIO_ID = "crosspoint-four-user-demo-chat-v2";
const mainQuestion = "AI 进入工作流后，我们怎样重新定义一份值得投入的工作？";
const privateComment = "E2E 私密短评：价值判断清楚，适合继续深入聊。";
const financeToRecruiter = "E2E 商科→哲学：如果授权与责任不对等，效率确实不能代表主体性。";
const financeToEducator = "E2E 商科→社会学：组织设计必须把保障与成长机会一起纳入收益分配。";
const educatorFollowUp = "E2E 社会学继续回复商科：除了收益分配，还要追问谁有能力拒绝不合理的流程。";
const names: Record<PersonaId, string> = {
  finance: "林澈", computer: "周屿", recruiter: "许舟", educator: "陈知遥", practitioner: "顾言",
};
const roles: Record<PersonaId, string> = {
  finance: "商科学生", computer: "计算机专业学生", recruiter: "哲学研究生",
  educator: "社会学研究者", practitioner: "AI 产品实践者",
};
const openings: Record<PersonaId, string> = {
  finance: "E2E 商科视角认为，值得投入的工作应让效率收益转化为真实成长；企业不能只提高指标，也要重新设计授权与反馈。",
  computer: "判断：E2E 计算机视角认为，值得投入的工作应保留理解系统和承担结果的空间。\n理由：生成成本下降后，问题定义、验证和异常处理成为更核心的劳动。\n证据：项目里最耗时的仍是评价输出和修复失败案例。\n不确定：入门任务减少后，新人怎样建立系统直觉？",
  recruiter: "判断：E2E 哲学视角认为，工作的价值不能只由效率定义，还要看人的主体性。\n理由：如果人只为机器结果兜底，劳动可能更快却未必更自主。\n证据：责任通常仍归于人，但人对技术流程的控制权并不总是对等。\n不确定：怎样识别被流程包装成自主选择的被动服从？",
  educator: "判断：E2E 社会学视角认为，值得投入的工作还需要稳定关系、社会承认与生活保障。\n理由：工作的意义由制度和资源分配共同塑造，不能只靠个人心态。\n证据：灵活就业带来自主性的同时，也可能把风险转移给个人。\n不确定：不同阶层是否同样拥有选择有意义工作的余地？",
  practitioner: "判断：E2E 实践视角认为，好的 AI 工作流应让人负责关键取舍并看见判断如何改善结果。\n理由：AI 可以协作执行，但人工复核、反馈和升级路径仍决定质量。\n证据：产品团队明确评估标准后，结果比只追求生成速度更稳定。\n不确定：企业是否愿意长期为这些判断环节付费？",
};
const openingJudgment = (actor:Actor) => actor.opening.split("\n")[0]!.replace(/^判断：/, "");

async function openDirector(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: /签名 DEMO 身份/ }).click();
  const dialog = page.getByRole("dialog", { name: "演示导演台" });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function createActor(context: BrowserContext, id: PersonaId): Promise<Actor> {
  const page = await context.newPage();
  await page.goto("/match");
  const identityTrigger = page.getByRole("button", { name: /签名 DEMO 身份/ });
  await expect(identityTrigger).toBeVisible();
  if (id !== "finance") {
    const dialog = await openDirector(page);
    await dialog.getByRole("button", { name: new RegExp(roles[id]) }).click();
  }
  await expect(identityTrigger).toContainText(roles[id]);
  return { id, role: roles[id], page, opening: openings[id] };
}

async function completeProfileAndChooseQuestion(page: Page): Promise<void> {
  await page.goto("/onboarding");
  const tagGroup = (legend:string) => page.locator("fieldset.tag-group").filter({ has:page.locator("legend", { hasText:legend }) });
  const interests = tagGroup("我感兴趣");
  await interests.getByRole("tabpanel").getByRole("button", { name: "人工智能", exact:true }).click();
  await interests.getByRole("tab", { name: /^商业与产业/ }).click();
  await interests.getByRole("tabpanel").getByRole("button", { name: "组织管理", exact:true }).click();
  await interests.getByRole("tab", { name: /^职业与劳动/ }).click();
  for (const label of ["就业", "未来工作"]) await interests.getByRole("tabpanel").getByRole("button", { name:label, exact:true }).click();
  await expect(interests.getByRole("list", { name: "已选兴趣" }).getByRole("button")).toHaveCount(4);
  await expect(interests.getByRole("status")).toContainText("已选 4 个，已满足");
  await page.getByLabel(/我从哪里出发/).selectOption({ label: "商科 / 组织" });
  for (const label of ["商业与组织视角", "个人经历"]) await tagGroup("我能贡献").getByRole("button", { name: new RegExp(label) }).click();
  for (const label of ["技术实践视角", "人文与伦理视角"]) await tagGroup("我想了解").getByRole("button", { name: new RegExp(label) }).click();
  await tagGroup("我希望遇见").getByRole("button", { name: /社会结构视角/ }).click();

  const savePromise = page.waitForResponse((response) => response.url().includes("/actions") && response.request().postData()?.includes('"type":"saveProfile"') === true);
  await page.getByRole("button", { name: /根据标签推荐问题/ }).click();
  const saveResponse = await savePromise;
  expect(saveResponse.status()).toBe(200);
  const saveBody = await saveResponse.json() as { state?: { questionRecommendations?: { questionId:string; matchedTagIds:string[] }[] } };
  expect(saveBody.state?.questionRecommendations?.[0]?.questionId).toBe("q-ai-major");
  expect(saveBody.state?.questionRecommendations?.[0]?.matchedTagIds).toContain("topic.ai");
  await expect(page.getByRole("heading", { name: mainQuestion })).toBeVisible();

  const questionCard = page.locator("article.recommended-question-card").filter({ has:page.getByRole("heading", { name:mainQuestion }) });
  const choosePromise = page.waitForResponse((response) => response.url().includes("/actions") && response.request().postData()?.includes('"type":"chooseQuestion"') === true);
  await questionCard.getByRole("button", { name: /选择这个问题/ }).click();
  expect((await choosePromise).status()).toBe(200);
  await expect(page).toHaveURL(/\/match$/);
}

test("interest library supports category keyboard navigation and persistent cross-category selection", async ({ page }) => {
  await page.goto("/onboarding");
  const interests = page.getByRole("group", { name:/我感兴趣/ });
  const technologyTab = interests.getByRole("tab", { name:/^科技与工程/ });
  const businessTab = interests.getByRole("tab", { name:/^商业与产业/ });
  const humanitiesTab = interests.getByRole("tab", { name:/^人文与价值/ });
  await expect(technologyTab).toHaveAttribute("aria-selected", "true");
  await expect(technologyTab).toHaveAttribute("tabindex", "0");

  await interests.getByRole("tabpanel").getByRole("button", { name:"人工智能", exact:true }).click();
  await businessTab.click();
  await interests.getByRole("tabpanel").getByRole("button", { name:"组织管理", exact:true }).click();
  await expect(interests.getByRole("list", { name:"已选兴趣" }).getByRole("button")).toHaveCount(2);
  await expect(businessTab).toContainText("1 已选");

  await businessTab.press("End");
  await expect(humanitiesTab).toHaveAttribute("aria-selected", "true");
  await humanitiesTab.press("Home");
  await expect(technologyTab).toHaveAttribute("aria-selected", "true");
  await expect(technologyTab).toContainText("1 已选");

  await interests.getByRole("button", { name:"取消选择：人工智能", exact:true }).click();
  await expect(interests.getByRole("list", { name:"已选兴趣" }).getByRole("button")).toHaveCount(1);
  await expect(interests.getByRole("status")).toContainText("已选 1 个，还需 2 个");
  await expect(technologyTab).toContainText("8 个");
});

async function acceptInvite(actor: Actor): Promise<void> {
  await actor.page.goto("/match");
  const responsePromise = actor.page.waitForResponse((response) => response.url().includes("/actions") && response.request().postData()?.includes('"type":"accept"') === true);
  await actor.page.getByRole("button", { name: /接受邀请/ }).click();
  expect((await responsePromise).status()).toBe(200);
  await expect(actor.page.getByRole("heading", { name: "邀请状态：accepted" })).toBeVisible();
}

async function sendOpening(actor: Actor): Promise<void> {
  await actor.page.goto("/room");
  const responsePromise = actor.page.waitForResponse((response) => response.url().includes("/actions") && response.request().postData()?.includes('"type":"submitPosition"') === true);
  await actor.page.getByLabel("输入发言").fill(actor.opening);
  const sendButton = actor.page.getByRole("button", { name: "发送消息" });
  await expect(sendButton).toBeEnabled();
  await sendButton.click();
  expect((await responsePromise).status()).toBe(200);
  await expect(actor.page.getByText(openingJudgment(actor), { exact:true })).toBeVisible();
}

function messageCardByText(page: Page, text: string): Locator {
  return page.locator("article.chat-message").filter({
    has: page.locator(".chat-bubble").getByText(text, { exact:true }),
  });
}

async function replyTo(actor: Actor, target: Actor, content: string): Promise<void> {
  const openingCard = messageCardByText(actor.page, openingJudgment(target));
  await openingCard.getByRole("button", { name:/^回复 / }).click();
  const composerQuote = actor.page.locator(".composer-quote");
  await expect(composerQuote).toContainText(`正在回复 ${names[target.id]}`);
  await expect(composerQuote).toContainText(openingJudgment(target));
  const responsePromise = actor.page.waitForResponse((response) => response.url().includes("/actions") && response.request().postData()?.includes('"type":"submitResponse"') === true);
  await actor.page.getByLabel("输入发言").fill(content);
  await actor.page.getByRole("button", { name:"发送消息" }).click();
  expect((await responsePromise).status()).toBe(200);
}

async function replyToResponse(actor: Actor, target: Actor, targetText: string, content: string, nestedQuoteText: string): Promise<void> {
  const responseCard = messageCardByText(actor.page, targetText);
  await responseCard.getByRole("button", { name:/^回复 / }).click();

  const composerQuote = actor.page.locator(".composer-quote");
  await expect(composerQuote).toContainText(`正在回复 ${names[target.id]}`);
  await expect(composerQuote).toContainText(targetText);
  await expect(composerQuote).not.toContainText(nestedQuoteText);

  const responsePromise = actor.page.waitForResponse((response) => response.url().includes("/actions") && response.request().postData()?.includes('"type":"submitResponse"') === true);
  await actor.page.getByLabel("输入发言").fill(content);
  await actor.page.getByRole("button", { name:"发送消息" }).click();
  expect((await responsePromise).status()).toBe(200);

  const sentCard = messageCardByText(actor.page, content);
  await expect(sentCard.locator(".chat-quote")).toContainText(targetText);
  await expect(sentCard.locator(".chat-quote")).not.toContainText(nestedQuoteText);
}

async function directDuplicateReply(page: Page, targetPositionId: string): Promise<{ status:number; body:string }> {
  return page.evaluate(async ({ scenarioId, targetId }) => {
    const token = window.sessionStorage.getItem("crosspoint.demo.session-token");
    const response = await fetch(`/api/scenarios/${scenarioId}/actions`, {
      method:"POST", headers:{ "Content-Type":"application/json", Authorization:`Demo ${token}` },
      body:JSON.stringify({ type:"submitResponse", targetPositionId:targetId, relation:"complementary", content:"E2E 重复回复不应写入。" }),
    });
    return { status:response.status, body:await response.text() };
  }, { scenarioId:SCENARIO_ID, targetId:targetPositionId });
}

test("four signed Demo tabs complete the tag-matched asynchronous conversation and consent loop", async ({ context }) => {
  const finance = await createActor(context, "finance");
  const computer = await createActor(context, "computer");
  const recruiter = await createActor(context, "recruiter");
  const educator = await createActor(context, "educator");
  const initialPages = [finance.page, computer.page, recruiter.page, educator.page];

  try {
    await completeProfileAndChooseQuestion(finance.page);
    const tabTokens = await Promise.all([finance, computer, recruiter, educator].map(({ page }) => page.evaluate(() => window.sessionStorage.getItem("crosspoint.demo.session-token"))));
    expect(tabTokens.every(Boolean)).toBe(true);
    expect(new Set(tabTokens).size).toBe(4);

    await acceptInvite(finance);
    await acceptInvite(recruiter);
    await acceptInvite(educator);

    await finance.page.reload();
    const director = await openDirector(finance.page);
    const timePromise = finance.page.waitForResponse((response) => response.url().includes("/actions") && response.request().postData()?.includes('"type":"advanceTime"') === true);
    await director.getByRole("button", { name:/推进模拟时间 \+12 小时/ }).click();
    expect((await timePromise).status()).toBe(200);
    await expect(director.getByRole("button", { name:/计算机专业学生.*timed_out/ })).toBeVisible();
    await expect(director.getByRole("button", { name:/AI 产品实践者.*invited/ })).toBeVisible();
    await director.getByRole("button", { name:"关闭演示导演台" }).click();

    await computer.page.reload();
    await expect(computer.page.getByText(/状态：timed_out/)).toBeVisible();
    const timedOutComputer = await createActor(context, "computer");
    initialPages.push(timedOutComputer.page);
    const replacementDialog = await openDirector(computer.page);
    await replacementDialog.getByRole("button", { name:/AI 产品实践者/ }).click();
    const practitioner: Actor = { id:"practitioner", role:roles.practitioner, page:computer.page, opening:openings.practitioner };
    await acceptInvite(practitioner);

    await finance.page.reload();
    await expect(finance.page.getByText("聊天室可以开放")).toBeVisible();
    const startPromise = finance.page.waitForResponse((response) => response.url().includes("/actions") && response.request().postData()?.includes('"type":"start"') === true);
    await finance.page.getByRole("button", { name:/打开 12 小时聊天室/ }).click();
    expect((await startPromise).status()).toBe(200);
    await expect(finance.page).toHaveURL(/\/room$/);

    const actors = [finance, recruiter, educator, practitioner];
    for (const actor of actors) {
      await actor.page.goto("/room");
      await expect(actor.page.getByText("本轮剩余")).toBeVisible();
      await expect(actor.page.locator(".chat-room-clock strong")).toHaveText(/^\d{2,}:\d{2}:\d{2}$/);
      await expect(actor.page.getByRole("heading", { name:"开房与会后复盘条件" })).toBeVisible();
      await expect(actor.page.locator(".recap-conditions")).toContainText(/12 小时.*(?:结束|归零|到期)/);
      await expect(actor.page.getByRole("button", { name:"请求推进阶段" })).toHaveCount(0);
      await expect(actor.page.getByRole("button", { name:/确认收束并生成总结/ })).toHaveCount(0);
    }

    await sendOpening(finance);

    await recruiter.page.reload();
    await expect(recruiter.page.getByText(openingJudgment(finance), { exact:true })).toHaveCount(0);
    await expect(recruiter.page.getByText("已提交首条发言 · 内容暂时隐藏")).toBeVisible();
    await finance.page.reload();
    await expect(finance.page.getByText(openingJudgment(finance), { exact:true })).toBeVisible();

    await sendOpening(recruiter);
    await sendOpening(educator);
    await sendOpening(practitioner);
    await expect(practitioner.page.getByText("所有独立发言已公开")).toBeVisible();

    for (const actor of actors) {
      await actor.page.reload();
      for (const other of actors.filter((candidate) => candidate.id !== actor.id)) await expect(actor.page.getByText(openingJudgment(other), { exact:true })).toBeVisible();
    }

    await replyTo(finance, recruiter, financeToRecruiter);
    await replyTo(finance, educator, financeToEducator);
    const duplicate = await directDuplicateReply(finance.page, "position-recruiter");
    expect(duplicate.status).toBe(409);
    expect(duplicate.body).toContain("已经回复过这条消息");
    await expect(finance.page.getByText(financeToRecruiter)).toBeVisible();
    await expect(finance.page.getByText(financeToEducator)).toBeVisible();

    await replyTo(recruiter, finance, "E2E 哲学→商科：我会追问成长是否也包含对目标本身的质疑权。");
    await educator.page.reload();
    await replyToResponse(educator, finance, financeToEducator, educatorFollowUp, openingJudgment(educator));
    await educator.page.reload();
    const persistedFollowUp = messageCardByText(educator.page, educatorFollowUp);
    await expect(persistedFollowUp.locator(".chat-quote")).toContainText("回复 林澈");
    await expect(persistedFollowUp.locator(".chat-quote")).toContainText(financeToEducator);
    await expect(persistedFollowUp.locator(".chat-quote")).not.toContainText(openingJudgment(educator));
    await replyTo(practitioner, recruiter, "E2E 实践→哲学：责任边界需要落实成可执行的人工升级路径。");

    await finance.page.reload();
    await expect(finance.page).toHaveURL(/\/room$/);
    await expect(finance.page.locator(".recap-conditions")).toContainText("每位在桌成员至少回复另一人 1 次");
    await expect(finance.page.locator(".recap-conditions")).toContainText("4/4");
    await expect(finance.page.getByRole("button", { name:"请求推进阶段" })).toHaveCount(0);
    await expect(finance.page.getByRole("button", { name:/确认收束并生成总结/ })).toHaveCount(0);

    await finance.page.goto("/summary");
    await expect(finance.page.getByRole("heading", { name:"会后复盘尚未解锁。" })).toBeVisible();
    await finance.page.goto("/room");
    const closeDirector = await openDirector(finance.page);
    const closeTimePromise = finance.page.waitForResponse((response) => response.url().includes("/actions") && response.request().postData()?.includes('"type":"advanceTime"') === true);
    await closeDirector.getByRole("button", { name:/推进模拟时间 \+12 小时/ }).click();
    const closeTimeResponse = await closeTimePromise;
    expect(closeTimeResponse.status()).toBe(200);
    const closedState = await closeTimeResponse.json() as { state?: { room?: { state?:string; terminalReason?:string; summary?:unknown } } };
    expect(closedState.state?.room).toMatchObject({ state:"ENDED", terminalReason:"COMPLETED", summary:expect.any(Object) });
    await expect(finance.page.getByRole("heading", { name:"这轮对话已收束。" })).toBeVisible();

    for (const actor of actors) {
      await actor.page.goto("/summary");
      await expect(actor.page.getByText("PERSPECTIVE MAP · 4 个真实提交节点")).toBeVisible();
    }
    await timedOutComputer.page.goto("/summary");
    await expect(timedOutComputer.page.getByRole("heading", { name:/(?:会后)?复盘已生成，但当前身份无查看权限。/ })).toBeVisible();
    await expect(timedOutComputer.page.locator(".recap-conditions")).toContainText("会后复盘已生成");
    await expect(timedOutComputer.page.locator(".recap-blocked-state")).toContainText("只有本轮实际参与者可以查看");
    await expect(timedOutComputer.page.getByText(/PERSPECTIVE MAP/)).toHaveCount(0);

    await finance.page.goto("/summary");
    await expect(finance.page.locator(".map-accessible").getByText(openingJudgment(finance), { exact:true })).toBeVisible();

    const recruiterCard = finance.page.locator("article.peer-feedback-card").filter({ hasText:"许舟" });
    await recruiterCard.locator('input[type="range"]').nth(0).fill("5");
    await recruiterCard.locator('input[type="range"]').nth(1).fill("4");
    await recruiterCard.getByLabel("可选短评").fill(privateComment);
    const ratingPromise = finance.page.waitForResponse((response) => response.url().includes("/actions") && response.request().postData()?.includes('"type":"submitPeerRating"') === true);
    await recruiterCard.getByRole("button", { name:"提交私密评价" }).click();
    const ratingResponse = await ratingPromise;
    expect(ratingResponse.status()).toBe(200);
    expect(await ratingResponse.text()).not.toContain(privateComment);
    await expect(recruiterCard.getByRole("button", { name:/我的评价已提交/ })).toBeDisabled();

    await recruiter.page.goto("/summary");
    await expect(recruiter.page.getByText(privateComment)).toHaveCount(0);
    const recruiterState = await recruiter.page.evaluate(async ({ scenarioId, marker }) => {
      const token = window.sessionStorage.getItem("crosspoint.demo.session-token");
      const response = await fetch(`/api/scenarios/${scenarioId}`, { headers:{ Authorization:`Demo ${token}` } });
      const text = await response.text();
      return { status:response.status, leaked:text.includes(marker) };
    }, { scenarioId:SCENARIO_ID, marker:privateComment });
    expect(recruiterState).toEqual({ status:200, leaked:false });

    const requestConnectionPromise = finance.page.waitForResponse((response) => response.url().includes("/actions") && response.request().postData()?.includes('"type":"requestConnection"') === true);
    await recruiterCard.getByRole("button", { name:/想继续聊 \/ 交换知乎号/ }).click();
    expect((await requestConnectionPromise).status()).toBe(200);
    await expect(recruiterCard.getByText(/已发送 · 等待双方同意/)).toBeVisible();
    await expect(finance.page.getByText("demo_recruiter", { exact:true })).toHaveCount(0);

    await recruiter.page.reload();
    const financeCard = recruiter.page.locator("article.peer-feedback-card").filter({ hasText:"林澈" });
    await expect(financeCard.getByText(/想继续聊并交换 Test 知乎号/)).toBeVisible();
    await expect(recruiter.page.getByText("demo_finance", { exact:true })).toHaveCount(0);
    const consentPromise = recruiter.page.waitForResponse((response) => response.url().includes("/actions") && response.request().postData()?.includes('"type":"respondConnection"') === true);
    await financeCard.getByRole("button", { name:"同意交换" }).click();
    expect((await consentPromise).status()).toBe(200);
    await expect(financeCard.getByText("demo_finance", { exact:true })).toBeVisible();

    await finance.page.reload();
    await expect(finance.page.getByText("demo_recruiter", { exact:true })).toBeVisible();
    await expect(finance.page.getByText("PERSPECTIVE MAP · 4 个真实提交节点")).toBeVisible();
    const persistedRecruiterCard = finance.page.locator("article.peer-feedback-card").filter({ hasText:"许舟" });
    await expect(persistedRecruiterCard.getByRole("button", { name:/我的评价已提交/ })).toBeDisabled();
    await recruiter.page.reload();
    await expect(recruiter.page.getByText("demo_finance", { exact:true })).toBeVisible();

    await finance.page.goto("/discover");
    await expect(finance.page.getByRole("heading", { name:"为你匹配的新聊天室" })).toBeVisible();
    await expect(finance.page.locator(".next-room-list article")).toHaveCount(3);
    const beforeRooms = await finance.page.locator(".next-room-list h3").allTextContents();
    const refreshPromise = finance.page.waitForResponse((response) => response.url().includes("/actions") && response.request().postData()?.includes('"type":"refreshNextRooms"') === true);
    await finance.page.getByRole("button", { name:"换一批聊天室" }).click();
    expect((await refreshPromise).status()).toBe(200);
    await expect(finance.page.getByRole("button", { name:/换一批聊天室，\d{2}:\d{2} 后可刷新/ })).toBeDisabled();
    const afterRooms = await finance.page.locator(".next-room-list h3").allTextContents();
    expect(afterRooms).not.toEqual(beforeRooms);
    await finance.page.reload();
    await expect(finance.page.getByRole("button", { name:/换一批聊天室，\d{2}:\d{2} 后可刷新/ })).toBeDisabled();

    await recruiter.page.goto("/discover");
    const recruiterRefresh = recruiter.page.getByRole("button", { name:"换一批聊天室" });
    await expect(recruiterRefresh).toBeEnabled();
  } finally {
    await Promise.all(initialPages.map((page) => page.close()));
  }
});
