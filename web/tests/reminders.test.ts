import { createECDH, randomBytes } from "node:crypto";
import { parse as legacyParse } from "node:url";
import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { PeriodInput } from "@/lib/cycle/cycle-calculator";
import { computeCycleSummary } from "@/lib/cycle/cycle-predictor";
import { addDays } from "@/lib/date/date-utils";
import type { Db } from "@/lib/db/local";
import { pushSubscriptions } from "@/lib/db/schema";
import { withUser } from "@/lib/db/with-user";
import type { PushMessage, PushResult, PushSender, PushTarget } from "@/lib/push";
import { cronAuthorized } from "@/lib/reminders/cron-auth";
import { dueReminders, INACTIVE_DAYS, REMINDER_TEXT, type ReminderSettings } from "@/lib/reminders/plan";
import { updateProfile } from "@/lib/services/profiles";
import {
  findPushSubscription,
  MAX_DEVICES,
  removePushSubscription,
  savePushSubscription,
} from "@/lib/services/push-subscriptions";
import { reminderUrl, runReminders } from "@/lib/services/reminders";
import { isPushEndpoint, pushSubscriptionSchema } from "@/lib/validation/push-schema";
import { createTestDb, createUser, expectDbRejects, rowsOf } from "./helpers/db";

/** 瀏覽器 PushSubscription.toJSON() 的樣子：P-256 公鑰 65 bytes、auth 16 bytes */
function subscription(id: string, host = "fcm.googleapis.com/fcm/send") {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    endpoint: `https://${host}/${id}`,
    keys: { p256dh: ecdh.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url") },
  };
}

const SETTINGS: ReminderSettings = {
  defaultCycleLength: null,
  defaultPeriodLength: null,
  predictionEnabled: true,
  remindBeforeDays: 2,
  remindInactive: true,
};

/** 三次已結束的經期，間隔 28 天 → 有個人平均可以預測 */
const HISTORY: PeriodInput[] = [
  { id: "p1", startDate: "2026-08-01", endDate: "2026-08-05" },
  { id: "p2", startDate: "2026-08-29", endDate: "2026-09-02" },
  { id: "p3", startDate: "2026-09-26", endDate: "2026-09-30" },
];

describe("提醒規則（純函式）", () => {
  const window = computeCycleSummary(HISTORY, SETTINGS, "2026-10-01").prediction!;
  const recent = "2026-10-01";

  it("預測快到了：預測區間開始前 N 天到區間結束都算；一個週期用同一個 refDate", () => {
    const from = addDays(window.windowStart, -2);
    expect(dueReminders(SETTINGS, HISTORY, recent, addDays(from, -1))).toEqual([]);
    expect(dueReminders(SETTINGS, HISTORY, recent, from)).toEqual([{ kind: "upcoming", refDate: "2026-09-26" }]);
    expect(dueReminders(SETTINGS, HISTORY, recent, window.windowEnd)).toEqual([
      { kind: "upcoming", refDate: "2026-09-26" },
    ]);
    // 超過區間（比預測晚）就不提醒「快到了」
    expect(dueReminders(SETTINGS, HISTORY, recent, addDays(window.windowEnd, 1))).toEqual([]);
    // 提前 3 天
    const three = { ...SETTINGS, remindBeforeDays: 3 };
    expect(dueReminders(three, HISTORY, recent, addDays(window.windowStart, -3))).toHaveLength(1);
  });

  it("預測快到了：關閉提醒、關閉預測、經期進行中都不提醒", () => {
    const day = window.windowStart;
    expect(dueReminders({ ...SETTINGS, remindBeforeDays: null }, HISTORY, recent, day)).toEqual([]);
    expect(dueReminders({ ...SETTINGS, predictionEnabled: false }, HISTORY, recent, day)).toEqual([]);
    const open = [...HISTORY, { id: "p4", startDate: addDays(day, -1), endDate: null }];
    expect(dueReminders(SETTINGS, open, recent, day)).toEqual([]);
  });

  it(`很久沒記錄：最後一次記錄距今 ${INACTIVE_DAYS} 天以上提醒一次（refDate＝最後記錄日）`, () => {
    const last = "2026-09-01";
    expect(dueReminders(SETTINGS, [], last, addDays(last, INACTIVE_DAYS - 1))).toEqual([]);
    expect(dueReminders(SETTINGS, [], last, addDays(last, INACTIVE_DAYS))).toEqual([
      { kind: "inactive", refDate: last },
    ]);
    expect(dueReminders({ ...SETTINGS, remindInactive: false }, [], last, addDays(last, 60))).toEqual([]);
  });

  it("通知內文中性：不提經期、症狀", () => {
    for (const text of Object.values(REMINDER_TEXT)) expect(text).not.toMatch(/經|血|症狀|排卵|懷孕/);
  });
});

describe("推播訂閱的驗證", () => {
  it("endpoint 只接受各家瀏覽器的推播服務（https、沒有連接埠或帳密）", () => {
    for (const ok of [
      "https://fcm.googleapis.com/fcm/send/abc",
      "https://updates.push.services.mozilla.com/wpush/v2/abc",
      "https://wns2-sg2p.notify.windows.com/w/?token=abc",
      "https://web.push.apple.com/abc",
      "https://fcm.googleapis.com/fcm/send/dXyz12:APA91bH-abc_123",
      "https://wns2-par02p.notify.windows.com/w/?token=BQYAAAB%2b%2fabc%3d",
    ]) {
      expect(isPushEndpoint(ok), ok).toBe(true);
      // web-push 送出時用 url.parse：要跟驗證時看到的是同一個主機
      expect(legacyParse(ok).hostname, ok).toBe(new URL(ok).hostname);
    }
    for (const bad of [
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://fcm.googleapis.com:8443/fcm/send/abc",
      "https://user:pass@fcm.googleapis.com/x",
      "https://fcm.googleapis.com.evil.example/x",
      "https://evil-push.apple.com.example/x",
      "https://localhost/x",
      "https://169.254.169.254/latest/meta-data",
      // 不同網址解析器解讀不一致的寫法：WHATWG 看到 *.push.apple.com，web-push 用的 url.parse 卻連到前面的主機
      "https://127.0.0.1%2Epush.apple.com/",
      "https://attacker.example%2Epush.services.mozilla.com/x",
      "https://evil.example%2enotify.windows.com/x",
      "https://evil.example\\@fcm.googleapis.com/x",
      "https://evil.example\\.push.apple.com/x",
      "https://FCM.googleapis.com/fcm/send/abc",
      "https://fcm.googleapis.com",
      "https://fcm.googleapis.com./x",
      "https://ｆcm.googleapis.com/x",
      // 主機名稱超過 253 字元：舊的 url.parse 會把主機變成空字串
      `https://${"a".repeat(300)}.push.apple.com/x`,
      "not a url",
    ]) {
      expect(isPushEndpoint(bad), bad).toBe(false);
    }
  });

  it("金鑰長度要對（p256dh 65 bytes、auth 16 bytes）", () => {
    expect(pushSubscriptionSchema.safeParse(subscription("x")).success).toBe(true);
    const s = subscription("x");
    expect(pushSubscriptionSchema.safeParse({ ...s, keys: { ...s.keys, auth: "short" } }).success).toBe(false);
    expect(
      pushSubscriptionSchema.safeParse({ ...s, keys: { ...s.keys, p256dh: randomBytes(32).toString("base64url") } })
        .success,
    ).toBe(false);
  });
});

describe("排程路由的授權", () => {
  const secret = "s".repeat(40);
  it("要帶正確的 Bearer 密鑰；沒設密鑰一律拒絕", () => {
    expect(cronAuthorized(`Bearer ${secret}`, secret)).toBe(true);
    expect(cronAuthorized(`Bearer ${secret}x`, secret)).toBe(false);
    expect(cronAuthorized(secret, secret)).toBe(false);
    expect(cronAuthorized(null, secret)).toBe(false);
    expect(cronAuthorized("Bearer ", null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 排程（PGlite）
// ---------------------------------------------------------------------------

/** 台灣時間 2026-10-22 早上 9 點半：落在 HISTORY 的預測區間裡 */
const NOW = new Date("2026-10-22T01:30:00Z");

class FakeSender implements PushSender {
  calls: { target: PushTarget; message: PushMessage }[] = [];
  results = new Map<string, PushResult>();
  fallback: PushResult = "sent";
  async send(target: PushTarget, message: PushMessage): Promise<PushResult> {
    this.calls.push({ target, message });
    return this.results.get(target.endpoint) ?? this.fallback;
  }
}

let db: Db;
let sender: FakeSender;

beforeEach(async () => {
  db = await createTestDb();
  sender = new FakeSender();
});

/** 直接寫入經期（控制建立／修改時間＝最後一次記錄） */
async function addPeriods(
  user: { userId: string; profileId: string },
  list: PeriodInput[],
  at = "2026-10-01T00:00:00Z",
) {
  for (const p of list) {
    await db.execute(sql`
      insert into lune.periods (user_id, profile_id, start_date, end_date, created_at, updated_at)
      values (${user.userId}, ${user.profileId}, ${p.startDate}, ${p.endDate}, ${at}, ${at})`);
  }
}

async function subscriptionCount(userId: string): Promise<number> {
  return rowsOf<{ n: number }>(
    await db.execute(sql`select count(*)::int n from lune.push_subscriptions where user_id = ${userId}`),
  )[0].n;
}

describe("提醒排程", () => {
  it("送到這個帳號的每台裝置；同一天再跑不重複；沒有訂閱裝置的帳號不送", async () => {
    const a = await createUser(db, "alice");
    const b = await createUser(db, "bob");
    await addPeriods(a, HISTORY);
    await addPeriods(b, HISTORY);
    const phone = subscription("a-phone");
    await savePushSubscription(db, a.userId, phone);
    await savePushSubscription(db, a.userId, subscription("a-laptop"));

    const first = await runReminders(db, sender, NOW);
    expect(first).toMatchObject({ today: "2026-10-22", profiles: 1, reminders: 1, sent: 2, gone: 0, failed: 0 });
    expect(sender.calls).toHaveLength(2);
    expect(sender.calls[0].message).toEqual({
      body: REMINDER_TEXT.upcoming,
      url: reminderUrl(a.profileId),
      tag: `lune-upcoming-${a.profileId}`,
    });
    expect(sender.calls[0].message.body).not.toContain("alice");

    const again = await runReminders(db, sender, NOW);
    expect(again).toMatchObject({ reminders: 0, sent: 0 });
    expect(sender.calls).toHaveLength(2);
  });

  it("失效的訂閱（410）會刪掉；全部送失敗時退回佔位，下次排程再試", async () => {
    const a = await createUser(db, "alice");
    await addPeriods(a, HISTORY);
    const phone = subscription("a-phone");
    const old = subscription("a-old");
    await savePushSubscription(db, a.userId, phone);
    await savePushSubscription(db, a.userId, old);

    sender.fallback = "failed";
    sender.results.set(old.endpoint, "gone");
    const failed = await runReminders(db, sender, NOW);
    expect(failed).toMatchObject({ reminders: 1, sent: 0, gone: 1, failed: 1 });
    expect(await subscriptionCount(a.userId)).toBe(1);

    sender.fallback = "sent";
    const retry = await runReminders(db, sender, NOW);
    expect(retry).toMatchObject({ reminders: 1, sent: 1 });
    const [row] = await withUser(db, a.userId, (tx) => tx.select().from(pushSubscriptions));
    expect(row.lastSentAt).not.toBeNull();
  });

  it("很久沒記錄：沒有任何紀錄時從 Profile 建立日起算；封存或關掉提醒的 Profile 不送", async () => {
    const a = await createUser(db, "alice");
    await savePushSubscription(db, a.userId, subscription("a"));
    const created = addDays("2026-10-22", -INACTIVE_DAYS);
    await db.execute(sql`update lune.profiles set created_at = ${`${created}T02:00:00Z`} where id = ${a.profileId}`);

    const res = await runReminders(db, sender, NOW);
    expect(res).toMatchObject({ reminders: 1, sent: 1 });
    expect(sender.calls[0].message.body).toBe(REMINDER_TEXT.inactive);
    const sends = rowsOf<{ kind: string; ref_date: string }>(
      await db.execute(sql`select kind, ref_date::text from lune.reminder_sends`),
    );
    expect(sends).toEqual([{ kind: "inactive", ref_date: created }]);

    const b = await createUser(db, "bob");
    await savePushSubscription(db, b.userId, subscription("b"));
    await db.execute(sql`update lune.profiles set created_at = ${`${created}T02:00:00Z`} where id = ${b.profileId}`);
    await updateProfile(db, b.userId, b.profileId, { remindBeforeDays: null, remindInactive: false });
    const c = await createUser(db, "carol");
    await savePushSubscription(db, c.userId, subscription("c"));
    await db.execute(
      sql`update lune.profiles set created_at = ${`${created}T02:00:00Z`}, archived_at = now() where id = ${c.profileId}`,
    );
    // 只剩 alice（今天已經送過）
    const none = await runReminders(db, sender, NOW);
    expect(none).toMatchObject({ profiles: 1, reminders: 0 });
    expect(sender.calls).toHaveLength(1);
  });
});

describe("推播訂閱的權限", () => {
  it("只看得到、刪得掉自己的訂閱；新增只能經過伺服器；已送出紀錄不開放給使用者", async () => {
    const a = await createUser(db, "alice");
    const b = await createUser(db, "bob");
    const sa = subscription("a");
    await savePushSubscription(db, a.userId, sa);

    expect(await withUser(db, b.userId, (tx) => tx.select().from(pushSubscriptions))).toEqual([]);
    expect(await findPushSubscription(db, b.userId, sa.endpoint)).toBeNull();
    await removePushSubscription(db, b.userId, sa.endpoint);
    expect(await subscriptionCount(a.userId)).toBe(1);

    await expectDbRejects(
      withUser(db, b.userId, (tx) =>
        tx
          .insert(pushSubscriptions)
          .values({ userId: b.userId, endpoint: "https://fcm.googleapis.com/x", p256dh: "x", auth: "y" }),
      ),
    );
    await expectDbRejects(withUser(db, b.userId, (tx) => tx.execute(sql`select * from lune.reminder_sends`)));

    await removePushSubscription(db, a.userId, sa.endpoint);
    expect(await subscriptionCount(a.userId)).toBe(0);
  });

  it("同一台裝置換帳號開啟通知：訂閱轉到新帳號；每個帳號最多記住 10 台", async () => {
    const a = await createUser(db, "alice");
    const b = await createUser(db, "bob");
    const shared = subscription("shared");
    await savePushSubscription(db, a.userId, shared);
    await savePushSubscription(db, b.userId, shared);
    expect(await findPushSubscription(db, a.userId, shared.endpoint)).toBeNull();
    expect(await findPushSubscription(db, b.userId, shared.endpoint)).not.toBeNull();

    for (let i = 0; i < MAX_DEVICES + 2; i++) await savePushSubscription(db, a.userId, subscription(`a-${i}`));
    expect(await subscriptionCount(a.userId)).toBe(MAX_DEVICES);
  });

  it("不合法的訂閱被擋下（不是推播服務的網址）", async () => {
    const a = await createUser(db, "alice");
    await expect(
      savePushSubscription(db, a.userId, { ...subscription("x"), endpoint: "https://evil.example/collect" }),
    ).rejects.toMatchObject({ code: "validation_failed" });
  });

  it("提醒設定的範圍（1–3 天或關閉）", async () => {
    const a = await createUser(db, "alice");
    expect(await updateProfile(db, a.userId, a.profileId, { remindBeforeDays: 3 })).toMatchObject({
      remindBeforeDays: 3,
    });
    expect(await updateProfile(db, a.userId, a.profileId, { remindBeforeDays: null })).toMatchObject({
      remindBeforeDays: null,
    });
    await expect(updateProfile(db, a.userId, a.profileId, { remindBeforeDays: 4 })).rejects.toMatchObject({
      code: "validation_failed",
    });
  });
});
