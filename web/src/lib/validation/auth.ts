import { z } from "zod";

/** 登入／註冊表單：前端與 Server Action 共用同一份 */
export const credentialsSchema = z.object({
  email: z.email("請輸入有效的 Email").max(254, "Email 太長"),
  password: z.string().min(8, "密碼至少 8 個字元").max(72, "密碼最多 72 個字元"),
  /** 註冊時的顯示名稱；留空就用 Email 的帳號部分 */
  name: z.string().trim().max(60, "名稱最多 60 個字").optional(),
});
export type Credentials = z.infer<typeof credentialsSchema>;
