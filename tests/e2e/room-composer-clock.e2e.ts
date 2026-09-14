import { expect, test, type BrowserContext, type Page } from "@playwright/test";

type PersonaId = "finance" | "computer" | "recruiter" | "educator";

const SCENARIO_ID = "crosspoint-four-user-demo-chat-v2";
const roles: Record<PersonaId, string> = {
  finance: "商科学生",
  computer: "计算机专业学生",
  recruiter: "哲学研究生",
  educator: "社会学研究者",
};
const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

async function openAs(context: BrowserContext, id: PersonaId): Promise<Page> {
  const page = await context.newPage();
  await page.goto("/match");
  const identity = page.getByRole("button", { name: /签名 DEMO 身份/ });
  await expect(identity).toBeVisible();
  if (id !== "finance") {
    await identity.click();
    const director = page.getByRole("dialog", { name: "演示导演台" });
    await expect(director).toBeVisible();
    await director.getByRole("button", { name: new RegExp(roles[id]) }).click();
  }
  await expect(identity).toContainText(roles[id]);
  return page;
}

async function scenarioAction(page: Page, command: Record<string, unknown>): Promise<{ status:number; body:string }> {
  return page.evaluate(async ({ scenarioId, action }) => {
    const token = window.sessionStorage.getItem("crosspoint.demo.session-token");
    const response = await fetch(`/api/scenarios/${scenarioId}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Demo ${token}` },
      body: JSON.stringify(action),
    });
    return { status: response.status, body: await response.text() };
  }, { scenarioId: SCENARIO_ID, action: command });
}

async function expectActionOk(page: Page, command: Record<string, unknown>): Promise<void> {
  const response = await scenarioAction(page, command);
  expect(response.status, response.body).toBe(200);
}

function countdownSeconds(value: string): number {
  const match = /^(\d{2,}):(\d{2}):(\d{2})$/.exec(value);
  expect(match, `expected HH:MM:SS countdown, received ${value}`).not.toBeNull();
  return Number(match![1]) * 3_600 + Number(match![2]) * 60 + Number(match![3]);
}

test("room composer uses chat keyboard conventions and the persisted deadline ticks in seconds", async ({ context }) => {
  const pages: Page[] = [];
  let finance: Page | undefined;

  try {
    finance = await openAs(context, "finance");
    pages.push(finance);
    await expectActionOk(finance, { type: "reset" });
    await expectActionOk(finance, { type: "chooseQuestion", questionId: "q-ai-major" });

    const computer = await openAs(context, "computer");
    const recruiter = await openAs(context, "recruiter");
    const educator = await openAs(context, "educator");
    pages.push(computer, recruiter, educator);

    for (const page of pages) await expectActionOk(page, { type: "accept" });
    await expectActionOk(finance, { type: "start" });
    await finance.goto("/room");

    const countdown = finance.locator(".chat-room-clock strong");
    await expect(countdown).toHaveText(/^\d{2,}:\d{2}:\d{2}$/);
    const before = countdownSeconds((await countdown.textContent())!.trim());
    await expect.poll(async () => countdownSeconds((await countdown.textContent())!.trim()), {
      message: "countdown should advance from its persisted virtual-time anchor",
      timeout: 4_000,
      intervals: [300, 400, 500],
    }).toBeLessThan(before);

    const composer = finance.getByLabel("输入发言");
    let submitRequests = 0;
    finance.on("request", (request) => {
      if (request.url().includes("/actions") && request.postData()?.includes('"type":"submitPosition"')) submitRequests += 1;
    });

    await composer.fill("第一行");
    await composer.press("Shift+Enter");
    await expect(composer).toHaveValue("第一行\n");
    await finance.waitForTimeout(300);
    expect(submitRequests).toBe(0);

    await finance.locator('input[type="file"]').setInputFiles({
      name: "e2e-观点图.png",
      mimeType: "image/png",
      buffer: onePixelPng,
    });
    await expect(finance.getByRole("img", { name:"待发送：e2e-观点图.png" })).toBeVisible();

    await composer.pressSequentially("第二行");
    const sent = finance.waitForResponse((response) =>
      response.url().includes("/actions") && response.request().postData()?.includes('"type":"submitPosition"') === true,
    );
    await composer.press("Enter");
    const response = await sent;
    expect(response.status()).toBe(200);
    const payload = await response.json() as { state?: { room?: { positions?: { authorId:string; judgment?:string; images?: { name:string }[] }[] } } };
    const ownPosition = payload.state?.room?.positions?.find((position) => position.authorId === "finance");
    expect(ownPosition?.judgment).toBe("第一行\n第二行");
    expect(ownPosition?.images).toMatchObject([{ name:"e2e-观点图.png" }]);
    expect(submitRequests).toBe(1);
    await expect(finance.getByText("本阶段输入已关闭")).toBeVisible();
    await expect(finance.getByRole("img", { name:"林澈发送的图片：e2e-观点图.png" })).toBeVisible();
    await finance.reload();
    await expect(finance.getByRole("img", { name:"林澈发送的图片：e2e-观点图.png" })).toBeVisible();
  } finally {
    if (finance && !finance.isClosed()) {
      await expectActionOk(finance, { type: "reset" }).catch(() => undefined);
    }
    await Promise.all(pages.map((page) => page.close()));
  }
});
