import { expect, type Page } from "@playwright/test";

/** 瀏覽器所在地（台北）的今天：YYYY-MM-DD */
export function todayInTaipei(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** 示範使用者一鍵登入 */
export async function loginDemo(page: Page, who: "A" | "B") {
  await page.goto("/login");
  await page.getByRole("button", { name: new RegExp(`以示範使用者 ${who}登入`) }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

/** 註冊一個全新的帳號（每個測試用自己的帳號，互不干擾） */
export async function registerFresh(page: Page, name = "測試"): Promise<{ email: string; password: string }> {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.test`;
  const password = "e2e-password-123";
  await page.goto("/login");
  await page.getByRole("tab", { name: "註冊" }).click();
  await page.getByLabel("顯示名稱（選填）").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/^密碼/).fill(password);
  await page.getByRole("button", { name: "建立帳號" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  return { email, password };
}

/** 等成功提示出現（前一個提示可能還沒消失，取最新的一個） */
export async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.getByRole("status").filter({ hasText: text }).last()).toBeVisible();
}
