import { expect, test, type Page } from "@playwright/test";

const SCENARIO_ID = "crosspoint-four-user-demo-chat-v2";

async function scenarioAction(page: Page, command: Record<string, unknown>): Promise<{ status:number; body:string }> {
  return page.evaluate(async ({ scenarioId, action }) => {
    const token = window.sessionStorage.getItem("crosspoint.demo.session-token");
    const response = await fetch(`/api/scenarios/${scenarioId}/actions`, {
      method: "POST",
      headers: { "Content-Type":"application/json", Authorization:`Demo ${token}` },
      body: JSON.stringify(action),
    });
    return { status:response.status, body:await response.text() };
  }, { scenarioId:SCENARIO_ID, action:command });
}

async function expectActionOk(page: Page, command: Record<string, unknown>): Promise<void> {
  const response = await scenarioAction(page, command);
  expect(response.status, response.body).toBe(200);
}

test("an active shared round replaces onboarding with clear recovery actions", async ({ page }) => {
  await page.goto("/match");
  await expect(page.getByRole("button", { name:/签名 DEMO 身份/ })).toContainText("商科学生");

  try {
    await expectActionOk(page, { type:"reset" });
    await expectActionOk(page, { type:"chooseQuestion", questionId:"q-ai-major" });
    await expectActionOk(page, { type:"accept" });

    await page.goto("/onboarding");
    await expect(page.getByRole("heading", { name:/这轮已经开始/ })).toBeVisible();
    await expect(page.getByText("切换身份不会解除这个锁", { exact:false })).toBeVisible();
    await expect(page.getByRole("link", { name:/继续处理邀请/ })).toHaveAttribute("href", "/match");
    await expect(page.getByRole("button", { name:"重置并重新设置标签" })).toBeVisible();
    await expect(page.getByRole("button", { name:/根据标签推荐问题/ })).toHaveCount(0);
    await expect(page.locator(".journey-disabled").filter({ hasText:"标签 → 问题" })).toHaveAttribute("aria-disabled", "true");

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name:"重置并重新设置标签" }).click();
    await expect(page.getByRole("heading", { name:"用标签介绍你想带进对话的部分" })).toBeVisible();
    await expect(page.locator(".journey-disabled").filter({ hasText:"标签 → 问题" })).toHaveCount(0);
  } finally {
    await expectActionOk(page, { type:"reset" }).catch(() => undefined);
  }
});
