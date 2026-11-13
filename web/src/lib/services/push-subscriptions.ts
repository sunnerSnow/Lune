import { and, desc, eq, notInArray, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/local";
import { pushSubscriptions } from "@/lib/db/schema";
import { withService, withUser } from "@/lib/db/with-user";
import { issuesFromZod, validationFailed } from "@/lib/errors";
import type { PushTarget } from "@/lib/push";
import { pushSubscriptionSchema } from "@/lib/validation/push-schema";

/** 每個帳號最多記住幾台裝置；超過時刪掉最舊的 */
export const MAX_DEVICES = 10;

/**
 * 記住這台裝置的推播訂閱。以伺服器身分執行：同一個 endpoint（同一個瀏覽器）之前若綁在別的帳號，
 * 要轉到現在登入的帳號（這台裝置之後只收這個帳號的提醒），RLS 下看不到別人的列，做不到。
 */
export async function savePushSubscription(db: Db, userId: string, input: unknown): Promise<void> {
  const parsed = pushSubscriptionSchema.safeParse(input);
  if (!parsed.success) throw validationFailed(issuesFromZod(parsed.error));
  const { endpoint, keys } = parsed.data;
  await withService(db, async (tx) => {
    await tx
      .insert(pushSubscriptions)
      .values({ userId, endpoint, p256dh: keys.p256dh, auth: keys.auth })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { userId, p256dh: keys.p256dh, auth: keys.auth, createdAt: sql`now()`, lastSentAt: null },
      });
    const keep = tx
      .select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId))
      .orderBy(desc(pushSubscriptions.createdAt))
      .limit(MAX_DEVICES);
    await tx
      .delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.userId, userId), notInArray(pushSubscriptions.id, keep)));
  });
}

/** 關掉這台裝置的通知（只刪自己的） */
export async function removePushSubscription(db: Db, userId: string, endpoint: unknown): Promise<void> {
  if (typeof endpoint !== "string" || endpoint.length > 1000) return;
  await withUser(db, userId, (tx) =>
    tx
      .delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint))),
  );
}

/** 這台裝置的訂閱是不是記在這個帳號底下；不是就回 null */
export async function findPushSubscription(db: Db, userId: string, endpoint: unknown): Promise<PushTarget | null> {
  if (typeof endpoint !== "string" || endpoint.length > 1000) return null;
  const [row] = await withUser(db, userId, (tx) =>
    tx
      .select({ endpoint: pushSubscriptions.endpoint, p256dh: pushSubscriptions.p256dh, auth: pushSubscriptions.auth })
      .from(pushSubscriptions)
      .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)))
      .limit(1),
  );
  return row ?? null;
}
