import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { addDays, dateInTimezone } from "@/lib/date/date-utils";
import type { Db } from "@/lib/db/local";
import { withService, withUser } from "@/lib/db/with-user";
import { AppError } from "@/lib/errors";
import { deleteDailyLog, getDailyLog, listDailyLogs, saveDailyLog } from "@/lib/services/daily-logs";
import { createPeriod, deletePeriod, endPeriod, listPeriods, startPeriod, updatePeriod } from "@/lib/services/periods";
import {
  createProfile,
  listProfiles,
  MAX_ACTIVE_PROFILES,
  resolveCurrentProfile,
  setProfileArchived,
  updateProfile,
} from "@/lib/services/profiles";
import { createTestDb, createUser, expectDbRejects, rowsOf } from "./helpers/db";

/** UTC 的今天一定通過「今天」的合理範圍檢查 */
const today = dateInTimezone(new Date(), "UTC");
const ago = (n: number) => addDays(today, -n);

let db: Db;
let a: { userId: string; profileId: string };
let b: { userId: string; profileId: string };

beforeEach(async () => {
  db = await createTestDb();
  a = await createUser(db, "alice");
  b = await createUser(db, "bob");
});

async function rejectsWith(p: Promise<unknown>, code: string): Promise<AppError> {
  const error = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe(code);
  return error as AppError;
}

describe("Profile", () => {
  it("註冊時建立第一個 Profile；可新增、編輯；同一帳號可管理多個", async () => {
    expect((await listProfiles(db, a.userId)).map((p) => p.displayName)).toEqual(["alice"]);
    const mom = await createProfile(db, a.userId, {
      displayName: "媽媽",
      defaultCycleLength: 30,
      avatarColor: "lavender",
    });
    expect(mom).toMatchObject({
      displayName: "媽媽",
      defaultCycleLength: 30,
      predictionEnabled: true,
      archived: false,
    });
    const edited = await updateProfile(db, a.userId, mom.id, { defaultCycleLength: null, predictionEnabled: false });
    expect(edited).toMatchObject({ displayName: "媽媽", defaultCycleLength: null, predictionEnabled: false });
    expect(await listProfiles(db, a.userId)).toHaveLength(2);
    expect(await listProfiles(db, b.userId)).toHaveLength(1);
  });

  it(`同時使用中的 Profile 最多 ${MAX_ACTIVE_PROFILES} 個；至少保留一個`, async () => {
    for (let i = 1; i < MAX_ACTIVE_PROFILES; i++) await createProfile(db, a.userId, { displayName: `P${i}` });
    await rejectsWith(createProfile(db, a.userId, { displayName: "太多" }), "profile_limit");

    await rejectsWith(setProfileArchived(db, b.userId, b.profileId, true), "last_profile");
  });

  it("封存後不能再寫入紀錄，也不會被選為目前 Profile；取消封存後恢復", async () => {
    const mom = await createProfile(db, a.userId, { displayName: "媽媽" });
    await setProfileArchived(db, a.userId, mom.id, true);
    expect((await listProfiles(db, a.userId)).map((p) => p.id)).toEqual([a.profileId]);
    expect(await listProfiles(db, a.userId, { includeArchived: true })).toHaveLength(2);
    await rejectsWith(startPeriod(db, a.userId, mom.id, { startDate: today }, today), "profile_archived");
    expect((await resolveCurrentProfile(db, a.userId, mom.id)).id).toBe(a.profileId);

    await setProfileArchived(db, a.userId, mom.id, false);
    expect((await resolveCurrentProfile(db, a.userId, mom.id)).id).toBe(mom.id);
  });

  it("目前 Profile 的 cookie 只是偏好：別人的或亂填的 ID 都退回自己的第一個", async () => {
    expect((await resolveCurrentProfile(db, a.userId, b.profileId)).id).toBe(a.profileId);
    expect((await resolveCurrentProfile(db, a.userId, "not-a-uuid")).id).toBe(a.profileId);
    expect((await resolveCurrentProfile(db, a.userId, null)).id).toBe(a.profileId);
  });
});

describe("經期", () => {
  it("開始 → 結束；結束日不可早於開始日、不可晚於今天", async () => {
    const started = await startPeriod(db, a.userId, a.profileId, { startDate: ago(3), notes: "  " }, today);
    expect(started).toMatchObject({ startDate: ago(3), endDate: null, notes: null });

    await rejectsWith(endPeriod(db, a.userId, a.profileId, { endDate: ago(4) }, today), "validation_failed");
    await rejectsWith(endPeriod(db, a.userId, a.profileId, { endDate: addDays(today, 1) }, today), "validation_failed");
    const ended = await endPeriod(db, a.userId, a.profileId, { endDate: today }, today);
    expect(ended).toMatchObject({ id: started.id, endDate: today });

    await rejectsWith(endPeriod(db, a.userId, a.profileId, { endDate: today }, today), "no_active_period");
  });

  it("已有進行中的經期不能再開始一筆；開始日不能晚於今天", async () => {
    await startPeriod(db, a.userId, a.profileId, { startDate: ago(2) }, today);
    const e = await rejectsWith(startPeriod(db, a.userId, a.profileId, { startDate: today }, today), "period_conflict");
    expect(e.message).toContain("已有進行中的經期");
    await rejectsWith(
      startPeriod(db, b.userId, b.profileId, { startDate: addDays(today, 1) }, today),
      "validation_failed",
    );
  });

  it("補登：重疊被拒；過去的經期沒填結束日會要求填寫；可編輯與刪除", async () => {
    const recent = await createPeriod(db, a.userId, a.profileId, { startDate: ago(10), endDate: ago(6) }, today);
    const old = await createPeriod(db, a.userId, a.profileId, { startDate: ago(40), endDate: ago(36) }, today);

    const overlap = await rejectsWith(
      createPeriod(db, a.userId, a.profileId, { startDate: ago(8), endDate: ago(4) }, today),
      "period_conflict",
    );
    expect(overlap.message).toContain("重疊");
    const missingEnd = await rejectsWith(
      createPeriod(db, a.userId, a.profileId, { startDate: ago(70) }, today),
      "period_conflict",
    );
    expect(missingEnd.message).toContain("請一併填寫結束日期");

    // 編輯自己不算重疊；改到和別筆重疊被拒
    expect(
      await updatePeriod(db, a.userId, recent.id, { startDate: ago(11), endDate: ago(6), notes: "改過" }, today),
    ).toMatchObject({ startDate: ago(11), notes: "改過" });
    await rejectsWith(
      updatePeriod(db, a.userId, old.id, { startDate: ago(40), endDate: ago(9) }, today),
      "period_conflict",
    );

    await deletePeriod(db, a.userId, old.id);
    expect((await listPeriods(db, a.userId, a.profileId)).map((p) => p.id)).toEqual([recent.id]);
  });

  it("前端傳來的「今天」不合理就拒絕", async () => {
    await rejectsWith(startPeriod(db, a.userId, a.profileId, { startDate: ago(1) }, ago(5)), "invalid_today");
    await rejectsWith(startPeriod(db, a.userId, a.profileId, { startDate: ago(1) }, "yesterday"), "invalid_today");
  });

  it("資料庫層也擋重疊與第二筆進行中（例如同時送出的請求）", async () => {
    await createPeriod(db, a.userId, a.profileId, { startDate: ago(30), endDate: ago(26) }, today);
    await startPeriod(db, a.userId, a.profileId, { startDate: ago(2) }, today);
    const insert = (start: string, end: string | null) =>
      withService(db, (tx) =>
        tx.execute(
          sql`insert into lune.periods (user_id, profile_id, start_date, end_date) values (${a.userId}, ${a.profileId}, ${start}, ${end})`,
        ),
      );
    expect(await expectDbRejects(insert(ago(28), ago(20)))).toMatch(/periods_no_overlap|conflicting key/);
    expect(await expectDbRejects(insert(ago(60), null))).toMatch(
      /periods_no_overlap|periods_one_open_uq|conflicting|duplicate/,
    );
    expect(await expectDbRejects(insert(ago(1), ago(1)))).toMatch(/periods_no_overlap|conflicting key/);
    expect(await expectDbRejects(insert(ago(100), ago(101)))).toMatch(/periods_dates_ck/);
    // 不同 Profile 同一天不衝突
    await createPeriod(db, b.userId, b.profileId, { startDate: ago(28), endDate: ago(24) }, today);
  });
});

describe("每日紀錄", () => {
  it("同一天再次儲存是更新，不會重複；清空所有欄位等於刪除", async () => {
    const first = await saveDailyLog(
      db,
      a.userId,
      a.profileId,
      { date: today, flow: "medium", symptoms: ["cramps"] },
      today,
    );
    const second = await saveDailyLog(db, a.userId, a.profileId, { date: today, mood: "calm" }, today);
    expect(second).toMatchObject({ id: first!.id, flow: null, symptoms: [], mood: "calm" });
    const n = rowsOf<{ n: number }>(await db.execute(sql`select count(*)::int n from lune.daily_logs`));
    expect(n[0].n).toBe(1);

    expect(await saveDailyLog(db, a.userId, a.profileId, { date: today, notes: "" }, today)).toBeNull();
    expect(await getDailyLog(db, a.userId, a.profileId, today)).toBeNull();
  });

  it("「無症狀」與其他症狀互斥（服務層與資料庫都擋）；不能記錄未來", async () => {
    await rejectsWith(
      saveDailyLog(db, a.userId, a.profileId, { date: today, symptoms: ["none", "headache"] }, today),
      "validation_failed",
    );
    await rejectsWith(
      saveDailyLog(db, a.userId, a.profileId, { date: addDays(today, 1), mood: "happy" }, today),
      "validation_failed",
    );
    const raw = withService(db, (tx) =>
      tx.execute(
        sql`insert into lune.daily_logs (user_id, profile_id, log_date, symptoms) values (${a.userId}, ${a.profileId}, ${today}, array['none','headache'])`,
      ),
    );
    expect(await expectDbRejects(raw)).toMatch(/daily_logs_symptoms_check|check constraint/);
  });

  it("依日期區間列出、刪除；記症狀不會讓那天變成經期", async () => {
    await saveDailyLog(db, a.userId, a.profileId, { date: ago(3), flow: "heavy" }, today);
    await saveDailyLog(db, a.userId, a.profileId, { date: ago(1), symptoms: ["headache"] }, today);
    await saveDailyLog(db, a.userId, a.profileId, { date: ago(40), mood: "low" }, today);
    expect((await listDailyLogs(db, a.userId, a.profileId, ago(7), today)).map((l) => l.date)).toEqual([
      ago(3),
      ago(1),
    ]);
    await deleteDailyLog(db, a.userId, a.profileId, ago(3));
    expect(await listDailyLogs(db, a.userId, a.profileId, ago(7), today)).toHaveLength(1);
    expect(await listPeriods(db, a.userId, a.profileId)).toHaveLength(0);
  });
});

describe("資料隔離（RLS＋複合外鍵）", () => {
  beforeEach(async () => {
    await createPeriod(db, a.userId, a.profileId, { startDate: ago(20), endDate: ago(16) }, today);
    await saveDailyLog(db, a.userId, a.profileId, { date: ago(18), flow: "heavy", notes: "A 的私人紀錄" }, today);
  });

  it("服務層：B 拿 A 的 Profile／經期 ID 也讀不到、改不到", async () => {
    await rejectsWith(listPeriods(db, b.userId, a.profileId), "not_found");
    await rejectsWith(listDailyLogs(db, b.userId, a.profileId, ago(30), today), "not_found");
    await rejectsWith(saveDailyLog(db, b.userId, a.profileId, { date: today, mood: "happy" }, today), "not_found");
    await rejectsWith(updateProfile(db, b.userId, a.profileId, { displayName: "偷改" }), "not_found");
    const [aPeriod] = await listPeriods(db, a.userId, a.profileId);
    await rejectsWith(
      updatePeriod(db, b.userId, aPeriod.id, { startDate: ago(20), endDate: ago(15) }, today),
      "not_found",
    );
    await rejectsWith(deletePeriod(db, b.userId, aPeriod.id), "not_found");
    expect(await listPeriods(db, a.userId, a.profileId)).toHaveLength(1);
  });

  it("RLS：B 的身分直接查表，看不到 A 的任何一列（即使不帶條件）", async () => {
    const counts = await withUser(db, b.userId, async (tx) => ({
      profiles: rowsOf<{ n: number }>(
        await tx.execute(sql`select count(*)::int n from lune.profiles where user_id <> ${b.userId}`),
      )[0].n,
      periods: rowsOf<{ n: number }>(await tx.execute(sql`select count(*)::int n from lune.periods`))[0].n,
      logs: rowsOf<{ n: number }>(await tx.execute(sql`select count(*)::int n from lune.daily_logs`))[0].n,
    }));
    expect(counts).toEqual({ profiles: 0, periods: 0, logs: 0 });

    // 改寫或刪除 A 的資料：RLS 讓這些列「不存在」，影響 0 列
    const touched = await withUser(db, b.userId, async (tx) => {
      await tx.execute(sql`update lune.daily_logs set notes = '被改了'`);
      await tx.execute(sql`delete from lune.periods`);
      return null;
    });
    expect(touched).toBeNull();
    const [log] = await listDailyLogs(db, a.userId, a.profileId, ago(30), today);
    expect(log.notes).toBe("A 的私人紀錄");
    expect(await listPeriods(db, a.userId, a.profileId)).toHaveLength(1);
  });

  it("複合外鍵：不能把紀錄掛到別人的 Profile；RLS 不讓寫入別人的 user_id", async () => {
    // B 的身分、user_id 是 B，但 profile 是 A 的 → (profile_id, user_id) 不存在
    const fk = withUser(db, b.userId, (tx) =>
      tx.execute(
        sql`insert into lune.periods (user_id, profile_id, start_date, end_date) values (${b.userId}, ${a.profileId}, ${ago(5)}, ${ago(3)})`,
      ),
    );
    expect(await expectDbRejects(fk)).toMatch(/periods_profile_fk|foreign key/);

    // 冒用 A 的 user_id → RLS with check 拒絕
    const spoof = withUser(db, b.userId, (tx) =>
      tx.execute(
        sql`insert into lune.daily_logs (user_id, profile_id, log_date, mood) values (${a.userId}, ${a.profileId}, ${today}, 'happy')`,
      ),
    );
    expect(await expectDbRejects(spoof)).toMatch(/row-level security/);

    // 也不能把自己的 Profile 改成別人的
    const steal = withUser(db, b.userId, (tx) =>
      tx.execute(sql`update lune.profiles set user_id = ${a.userId} where id = ${b.profileId}`),
    );
    expect(await expectDbRejects(steal)).toMatch(/row-level security/);
  });

  it("沒有身分（未登入）切成 authenticated 什麼都讀不到；也碰不到限流表", async () => {
    const n = await db.transaction(async (tx) => {
      await tx.execute(sql`set local role authenticated`);
      return rowsOf<{ n: number }>(await tx.execute(sql`select count(*)::int n from lune.profiles`))[0].n;
    });
    expect(n).toBe(0);
    const rl = db.transaction(async (tx) => {
      await tx.execute(sql`set local role authenticated`);
      await tx.execute(sql`select * from lune.rate_limits`);
    });
    expect(await expectDbRejects(rl)).toMatch(/permission denied/);
  });

  it("刪除帳號會連帶刪除所有 Profile 與紀錄", async () => {
    await db.execute(sql`delete from auth.users where id = ${a.userId}`);
    const left = rowsOf<{ p: number; e: number; l: number }>(
      await db.execute(sql`select
        (select count(*)::int from lune.profiles where user_id = ${a.userId}) p,
        (select count(*)::int from lune.periods where user_id = ${a.userId}) e,
        (select count(*)::int from lune.daily_logs where user_id = ${a.userId}) l`),
    );
    expect(left[0]).toEqual({ p: 0, e: 0, l: 0 });
    expect(await listProfiles(db, b.userId)).toHaveLength(1);
  });
});
