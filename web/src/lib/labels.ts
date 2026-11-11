import type { AvatarColor, Flow, Mood, Symptom } from "@/lib/types";

/** 介面顯示用的中文標籤（資料庫只存英文鍵） */

export const FLOW_LABELS: Record<Flow, string> = {
  none: "無",
  light: "少量",
  medium: "普通",
  heavy: "大量",
};

export const SYMPTOM_LABELS: Record<Symptom, string> = {
  cramps: "經痛",
  back_pain: "腰痠",
  headache: "頭痛",
  breast_tenderness: "乳房脹痛",
  fatigue: "疲勞",
  swelling: "水腫",
  acne: "長痘痘",
  nausea: "噁心",
  bloating: "腹脹",
  other: "其他",
  none: "無症狀",
};

export const MOOD_LABELS: Record<Mood, string> = {
  happy: "愉快",
  neutral: "普通",
  low: "低落",
  anxious: "焦慮",
  irritable: "煩躁",
  calm: "平靜",
};

export const AVATAR_COLOR_LABELS: Record<AvatarColor, string> = {
  rose: "玫瑰",
  lavender: "薰衣草",
  peach: "蜜桃",
  sage: "鼠尾草",
  sky: "天空",
  sand: "沙色",
};
