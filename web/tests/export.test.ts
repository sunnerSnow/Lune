import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db/local";
import { saveDailyLog } from "@/lib/services/daily-logs";
import { EXPORT_FORMAT, exportUserData } from "@/lib/services/export";
import { createPeriod } from "@/lib/services/periods";
import { createProfile, setProfileArchived } from "@/lib/services/profiles";
import { localToday } from "@/lib/date/date-utils";
import { createTestDb, createUser } from "./helpers/db";

let db: Db;
beforeEach(async () => {
  db = await createTestDb();
});

describe("匯出資料（JSON）", () => {
  it("包含自己所有 Profile（含已封存）與底下的紀錄；不含別人的資料", async () => {
    const today = localToday();
    const a = await createUser(db, "alice");
    const b = await createUser(db, "bob");
    const mom = await createProfile(db, a.userId, { displayName: "媽媽", defaultCycleLength: 30 });
    await createPeriod(db, a.userId, a.profileId, { startDate: "2026-09-01", endDate: "2026-09-05" }, today);
    await createPeriod(db, a.userId, mom.id, { startDate: "2026-09-10", endDate: "2026-09-14", notes: "備註" }, today);
    await saveDailyLog(db, a.userId, a.profileId, { date: "2026-09-02", symptoms: ["cramps"], mood: "low" }, today);
    await setProfileArchived(db, a.userId, mom.id, true);
    await createPeriod(db, b.userId, b.profileId, { startDate: "2026-09-03", endDate: "2026-09-06" }, today);

    const data = await exportUserData(db, a.userId, new Date("2026-11-11T00:00:00Z"));
    expect(data.format).toBe(EXPORT_FORMAT);
    expect(data.exportedAt).toBe("2026-11-11T00:00:00.000Z");
    expect(data.account).toMatchObject({ email: "alice@example.test", name: "alice" });
    expect(data.profiles.map((p) => [p.displayName, p.archived])).toEqual([
      ["alice", false],
      ["媽媽", true],
    ]);
    expect(data.profiles[0].periods.map((p) => p.startDate)).toEqual(["2026-09-01"]);
    expect(data.profiles[0].dailyLogs).toMatchObject([{ date: "2026-09-02", symptoms: ["cramps"], mood: "low" }]);
    expect(data.profiles[1].periods).toMatchObject([{ startDate: "2026-09-10", notes: "備註" }]);

    const json = JSON.stringify(data);
    expect(json).not.toContain(b.userId);
    expect(json).not.toContain("2026-09-03");
    expect(json).not.toContain("bob");
  });
});
