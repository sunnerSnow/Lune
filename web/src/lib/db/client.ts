import "server-only";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { isLocalMode } from "@/lib/config";
import { createPGlite, type Db, openLocalDb } from "@/lib/db/local";
import { schema } from "@/lib/db/schema";

export type { Db } from "@/lib/db/local";

const cache = globalThis as unknown as { __luneDb?: Promise<Db> };

/**
 * 取得資料庫：
 * - 有 DATABASE_URL：連 Postgres（Neon 用 pooled 連線字串；PgBouncer transaction mode，所以關掉 prepared statements）
 * - 沒有：本機示範模式，用 PGlite 存在 web/.data/pglite，啟動時自動跑 migration
 */
export function getDb(): Promise<Db> {
  cache.__luneDb ??= createDb().catch((error) => {
    cache.__luneDb = undefined;
    throw error;
  });
  return cache.__luneDb;
}

async function createDb(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const client = postgres(url, { prepare: false, max: Number(process.env.DATABASE_POOL_MAX ?? 5) });
    return drizzlePostgres(client, { schema });
  }
  if (!isLocalMode()) throw new Error("缺少 DATABASE_URL");
  const dataDir = process.env.PGLITE_DATA_DIR ?? path.join(process.cwd(), ".data", "pglite");
  // PGlite 只建立最後一層目錄；乾淨 checkout 的 .data 尚不存在，須先遞迴建立
  if (dataDir !== "memory://") await mkdir(dataDir, { recursive: true });
  return openLocalDb(createPGlite(dataDir === "memory://" ? undefined : dataDir));
}
