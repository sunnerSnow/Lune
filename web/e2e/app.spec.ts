import { expect, test } from "@playwright/test";
import { expectToast, loginDemo, registerFresh, shiftMonth, todayInTaipei } from "./helpers";

test.describe("未登入", () => {
  test("私人頁面導向登入；隱私權政策與使用條款不用登入就能看；有安全標頭 @desktop", async ({ page, request }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/calendar?d=2026-01-01");
    await expect(page).toHaveURL(/\/login$/);

    await page.goto("/privacy");
    await expect(page.getByRole("heading", { name: "隱私權政策" })).toBeVisible();
    await page.goto("/terms");
    await expect(page.getByRole("heading", { name: "使用條款" })).toBeVisible();

    const res = await request.get("/login");
    expect(res.headers()["x-frame-options"]).toBe("DENY");
    expect(res.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(res.headers()["x-content-type-options"]).toBe("nosniff");

    const exp = await request.get("/api/export", { maxRedirects: 0 });
    expect([302, 307, 401]).toContain(exp.status());
  });
});

// 示範使用者在手機與桌面兩組測試間共用同一份資料：這裡只讀，不寫入
test.describe("示範使用者 A（有範例資料）", () => {
  test("首頁顯示週期與預測；日曆標出經期與預測 @desktop", async ({ page }) => {
    await loginDemo(page, "A");
    await expect(page.getByText("週期第 13 天")).toBeVisible();
    await expect(page.getByText("下次經期")).toBeVisible();
    await page.goto("/calendar");
    await expect(page.getByRole("link", { name: /經期/ }).first()).toBeVisible();
    await expect(page.getByRole("list", { name: "圖例" })).toBeVisible();
  });

  test("「無症狀」與其他症狀互斥", async ({ page }) => {
    await loginDemo(page, "A");
    await page.getByRole("button", { name: /記錄今天|編輯今天/ }).click();
    const sheet = page.getByRole("dialog");
    await sheet.getByRole("button", { name: "腰痠" }).click();
    await sheet.getByRole("button", { name: "無症狀" }).click();
    await expect(sheet.getByRole("button", { name: "無症狀" })).toHaveAttribute("aria-pressed", "true");
    await expect(sheet.getByRole("button", { name: "腰痠" })).toHaveAttribute("aria-pressed", "false");
    await sheet.getByRole("button", { name: "經痛" }).click();
    await expect(sheet.getByRole("button", { name: "無症狀" })).toHaveAttribute("aria-pressed", "false");
  });

  test("切換 Profile 後首頁資料跟著換", async ({ page }) => {
    await loginDemo(page, "A");
    await expect(page.getByText("週期第 13 天")).toBeVisible();
    await page.getByRole("button", { name: /切換 Profile/ }).click();
    await page.getByRole("button", { name: "媽媽" }).click();
    await expect(page.getByText("依預設週期估算")).toBeVisible();
    await expect(page.getByText("週期第 13 天")).toHaveCount(0);
  });
});

test.describe("全新帳號", () => {
  test("記錄今天後同一天再存是更新，不會多一筆 @desktop", async ({ page }) => {
    await registerFresh(page);
    await page.getByRole("button", { name: "記錄今天" }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    await sheet.getByRole("button", { name: "頭痛" }).click();
    await sheet.getByRole("radio", { name: "平靜" }).click();
    await sheet.getByRole("button", { name: "儲存" }).click();
    await expectToast(page, "已儲存");
    await expect(page.getByRole("button", { name: "編輯今天" })).toBeVisible();

    // 再開一次：帶出既有紀錄，改心情後儲存 → 仍然只有一筆
    await page.getByRole("button", { name: "編輯今天" }).click();
    await expect(sheet.getByRole("button", { name: "頭痛" })).toHaveAttribute("aria-pressed", "true");
    await sheet.getByRole("radio", { name: "愉快" }).click();
    await sheet.getByRole("button", { name: "儲存" }).click();
    await expectToast(page, "已儲存");
    const today = todayInTaipei();
    const md = `${Number(today.slice(5, 7))}/${Number(today.slice(8))}`;
    const rows = page.getByRole("link").filter({ hasText: md }).filter({ hasText: "頭痛" });
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("愉快");
  });

  test("開始經期 → 首頁顯示經期第 1 天、按鈕換成結束 → 結束經期", async ({ page }) => {
    await registerFresh(page);
    await expect(page.getByText("記錄第一次經期後，就能看到週期")).toBeVisible();

    await page.getByRole("button", { name: "開始生理期" }).click();
    const sheet = page.getByRole("dialog");
    await sheet.getByRole("button", { name: "開始", exact: true }).click();
    await expectToast(page, "開始");
    await expect(page.getByText("經期第 1 天")).toBeVisible();
    await expect(page.getByRole("button", { name: "結束生理期" })).toBeVisible();

    // 日曆：今天標成經期
    const today = todayInTaipei();
    await page.goto(`/calendar?d=${today}`);
    await expect(page.getByRole("link", { name: new RegExp(`${Number(today.slice(8))} 日，今天，經期中`) })).toBeVisible();

    // 當日詳情可以直接打開「編輯這次經期」，帶出開始日期
    await page.getByRole("button", { name: "編輯這次經期" }).click();
    await expect(page.getByRole("dialog").getByLabel("開始日期")).toHaveValue(today);
    await page.getByRole("dialog").getByRole("button", { name: "關閉" }).click();

    await page.goto("/dashboard");
    await page.getByRole("button", { name: "結束生理期" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "結束", exact: true }).click();
    await expectToast(page, "結束");
    await expect(page.getByRole("button", { name: "開始生理期" })).toBeVisible();
  });

  test("從日曆補登上個月的經期；與它重疊的補登會被擋下", async ({ page }) => {
    await registerFresh(page);
    const ym = shiftMonth(todayInTaipei().slice(0, 7), -1);
    await page.goto(`/calendar?m=${ym}&d=${ym}-03`);
    await page.getByRole("button", { name: "補登：這天開始經期" }).click();
    let sheet = page.getByRole("dialog");
    await expect(sheet.getByLabel("開始日期")).toHaveValue(`${ym}-03`);
    await sheet.getByLabel(/結束日期/).fill(`${ym}-07`);
    await sheet.getByRole("button", { name: "儲存" }).click();
    await expectToast(page, "已儲存經期");
    await expect(page.getByRole("link", { name: new RegExp(`5 日，經期`) })).toBeVisible();

    await page.goto(`/calendar?m=${ym}&d=${ym}-09`);
    await page.getByRole("button", { name: "補登：這天開始經期" }).click();
    sheet = page.getByRole("dialog");
    await sheet.getByLabel("開始日期").fill(`${ym}-06`);
    await sheet.getByLabel(/結束日期/).fill(`${ym}-10`);
    await sheet.getByRole("button", { name: "儲存" }).click();
    await expect(sheet.getByRole("alert")).toContainText("重疊");
  });

  test("新增 Profile、匯出 JSON、刪除帳號（密碼錯誤先被擋）", async ({ page }) => {
    const { email, password } = await registerFresh(page, "本人");
    await page.goto("/settings");
    await page.getByRole("button", { name: "新增 Profile" }).click();
    const sheet = page.getByRole("dialog");
    await sheet.getByLabel("顯示名稱").fill("妹妹");
    await sheet.getByRole("button", { name: "新增" }).click();
    await expectToast(page, "已新增「妹妹」");

    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "下載我的資料（JSON）" }).click();
    const file = await download;
    const json = JSON.parse((await (await file.createReadStream()).toArray()).join(""));
    expect(json.format).toBe("lune-export@1");
    expect(json.account.email).toBe(email);
    expect(json.profiles.map((p: { displayName: string }) => p.displayName)).toEqual(["本人", "妹妹"]);

    await page.getByRole("button", { name: "刪除帳號與所有資料" }).click();
    const del = page.getByRole("dialog", { name: "刪除帳號" });
    await del.getByLabel("我了解刪除後無法復原").check();
    await del.getByLabel("請輸入密碼確認").fill("wrong-password");
    await del.getByRole("button", { name: "永久刪除帳號" }).click();
    await expect(del.getByRole("alert")).toContainText("密碼不正確");

    await del.getByLabel("請輸入密碼確認").fill(password);
    await del.getByRole("button", { name: "永久刪除帳號" }).click();
    await expect(page).toHaveURL(/\/login\?deleted=1$/);
    await expect(page.getByText("帳號與所有資料已刪除。")).toBeVisible();

    // 刪除後無法再登入
    await page.getByLabel("Email").fill(email);
    await page.getByLabel(/^密碼/).fill(password);
    await page.getByRole("button", { name: "登入", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Email 或密碼不正確" })).toBeVisible();
  });
});
