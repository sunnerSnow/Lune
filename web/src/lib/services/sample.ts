import { and, asc, eq } from "drizzle-orm";
import { addDays, dateInTimezone, DEFAULT_TIMEZONE } from "@/lib/date/date-utils";
import type { Db } from "@/lib/db/local";
import { dailyLogs, periods, profiles } from "@/lib/db/schema";
import { withUser } from "@/lib/db/with-user";
import type { Flow, Mood, Symptom } from "@/lib/types";

/**
 * 本機示範用的範例資料（只給示範使用者 A，第一次建立帳號時載入）。
 * 日期相對於「台灣的今天」：第一個 Profile 有 6 次經期（最近一次 12 天前開始）與幾筆每日紀錄；
 * 第二個 Profile「媽媽」只有一次經期＋預設週期 30 天，示範用預設值估算的情況。
 */
export async function seedSampleData(db: Db, userId: string, today = dateInTimezone(new Date(), DEFAULT_TIMEZONE)) {
  await withUser(db, userId, async (tx) => {
    const [first] = await tx
      .select()
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .orderBy(asc(profiles.createdAt))
      .limit(1);
    if (!first) throw new Error("示範使用者沒有 Profile");
    await tx
      .update(profiles)
      .set({ avatarColor: "rose" })
      .where(and(eq(profiles.id, first.id), eq(profiles.userId, userId)));

    // 由新到舊：與前一次的間隔（天）與經期天數
    const gaps = [27, 30, 28, 31, 29];
    const lengths = [5, 6, 5, 4, 5, 5];
    let start = addDays(today, -12);
    const starts = [start];
    for (const g of gaps) {
      start = addDays(start, -g);
      starts.push(start);
    }
    await tx.insert(periods).values(
      starts.map((s, i) => ({
        userId,
        profileId: first.id,
        startDate: s,
        endDate: addDays(s, lengths[i] - 1),
        notes: i === 0 ? "第一天特別痛，有吃止痛藥" : null,
      })),
    );

    const latest = starts[0];
    const logs: { offset: number; flow?: Flow; symptoms?: Symptom[]; mood?: Mood; notes?: string }[] = [
      { offset: 0, flow: "heavy", symptoms: ["cramps", "back_pain", "fatigue"], mood: "irritable" },
      { offset: 1, flow: "heavy", symptoms: ["cramps", "fatigue"], mood: "low" },
      { offset: 2, flow: "medium", symptoms: ["bloating"], mood: "neutral" },
      { offset: 3, flow: "light", symptoms: ["none"], mood: "calm" },
      { offset: 4, flow: "light", mood: "happy" },
      { offset: 9, mood: "happy", notes: "睡得很好" },
      { offset: 11, symptoms: ["acne"], mood: "neutral" },
    ];
    await tx.insert(dailyLogs).values(
      logs
        .map((l) => ({ ...l, date: addDays(latest, l.offset) }))
        .filter((l) => l.date <= today)
        .map((l) => ({
          userId,
          profileId: first.id,
          logDate: l.date,
          flow: l.flow ?? null,
          symptoms: l.symptoms ?? [],
          mood: l.mood ?? null,
          notes: l.notes ?? null,
        })),
    );

    const [mom] = await tx
      .insert(profiles)
      .values({ userId, displayName: "媽媽", avatarColor: "lavender", defaultCycleLength: 30, defaultPeriodLength: 5 })
      .returning();
    const momStart = addDays(today, -20);
    await tx
      .insert(periods)
      .values({ userId, profileId: mom.id, startDate: momStart, endDate: addDays(momStart, 4), notes: null });
  });
}
