/**
 * 領域型別與選項清單（與 db/migrations/20261111000100_init.sql 的 check 約束一致）。
 * 日期一律是 YYYY-MM-DD 字串（日曆日期，沒有時區）；時間戳是 ISO 字串。
 */

export const AVATAR_COLORS = ["rose", "lavender", "peach", "sage", "sky", "sand"] as const;
export type AvatarColor = (typeof AVATAR_COLORS)[number];

export const FLOWS = ["none", "light", "medium", "heavy"] as const;
export type Flow = (typeof FLOWS)[number];

/** 症狀：none（無症狀）與其他選項互斥 */
export const SYMPTOMS = [
  "cramps",
  "back_pain",
  "headache",
  "breast_tenderness",
  "fatigue",
  "swelling",
  "acne",
  "nausea",
  "bloating",
  "other",
  "none",
] as const;
export type Symptom = (typeof SYMPTOMS)[number];

export const MOODS = ["happy", "neutral", "low", "anxious", "irritable", "calm"] as const;
export type Mood = (typeof MOODS)[number];

export interface Profile {
  id: string;
  displayName: string;
  avatarColor: AvatarColor | null;
  defaultCycleLength: number | null;
  defaultPeriodLength: number | null;
  predictionEnabled: boolean;
  /** 預測區間開始前幾天提醒（1–3）；null＝不提醒 */
  remindBeforeDays: number | null;
  /** 超過 35 天沒有新增或修改紀錄時提醒 */
  remindInactive: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 一次經期；endDate 為 null 表示進行中 */
export interface Period {
  id: string;
  profileId: string;
  startDate: string;
  endDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DailyLog {
  id: string;
  profileId: string;
  date: string;
  flow: Flow | null;
  symptoms: Symptom[];
  mood: Mood | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}
