import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { PGlite, type PGliteOptions } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { drizzle } from "drizzle-orm/pglite";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { schema } from "@/lib/db/schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export const MIGRATIONS_DIR = path.join(process.cwd(), "db", "migrations");

/** 依檔名順序列出 migration（檔名以時間戳開頭，auth 在 init 之前） */
export async function listMigrations(): Promise<{ file: string; sql: string }[]> {
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  return Promise.all(
    files.map(async (file) => ({ file, sql: await readFile(path.join(MIGRATIONS_DIR, file), "utf8") })),
  );
}

/** 建立 PGlite（本機示範或測試）；經期不重疊的排除約束需要 btree_gist */
export function createPGlite(dataDir?: string, options: Omit<PGliteOptions, "dataDir"> = {}): PGlite {
  return new PGlite({ ...options, dataDir, extensions: { btree_gist, ...options.extensions } });
}

/** 本機（PGlite）：依序跑所有 migration（migration 本身可重複執行） */
export async function bootstrapLocal(client: PGlite): Promise<void> {
  for (const m of await listMigrations()) await client.exec(m.sql);
}

export async function openLocalDb(client: PGlite): Promise<Db> {
  await bootstrapLocal(client);
  return drizzle(client, { schema }) as unknown as Db;
}
