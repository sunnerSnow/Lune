import { z } from "zod";

/** 登入／註冊表單：前端與 Server Action 共用同一份 */
export const credentialsSchema = z.object({
  email: z.email("請輸入有效的 Email").max(254, "Email 太長"),
  password: z.string().min(8, "密碼至少 8 個字元").max(72, "密碼最多 72 個字元"),
  /** 註冊時的顯示名稱；留空就用 Email 的帳號部分 */
  name: z.string().trim().max(60, "名稱最多 60 個字").optional(),
});
export type Credentials = z.infer<typeof credentialsSchema>;

export const forgotPasswordSchema = z.object({
  email: z.email("請輸入有效的 Email").max(254, "Email 太長"),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

/** 重設密碼：token 來自信裡的連結 */
export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, "連結不完整，請重新開啟信裡的連結").max(512, "連結不完整，請重新開啟信裡的連結"),
    password: z.string().min(8, "密碼至少 8 個字元").max(72, "密碼最多 72 個字元"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "兩次輸入的密碼不一樣", path: ["confirm"] });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
