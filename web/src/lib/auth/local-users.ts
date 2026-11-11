/**
 * 本機示範模式的兩位固定使用者（可用來測試資料互相看不到）。
 * 啟動時由 Better Auth 建立帳號，登入頁可一鍵登入；密碼只在本機 PGlite 有意義。
 * 使用者 A 第一次建立時會載入範例資料（兩個 Profile），B 是空的。
 */
export const LOCAL_USERS = [
  { key: "a", email: "demo-a@lune.local", password: "demo-a-password", label: "示範使用者 A", sample: true },
  { key: "b", email: "demo-b@lune.local", password: "demo-b-password", label: "示範使用者 B", sample: false },
] as const;
