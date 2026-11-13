/**
 * 對 Postgres 依序執行 db/migrations/*.sql（每份都可重複執行），最後驗證：
 *   - authenticated／anon 的表權限
 *   - 連線角色能 set local role authenticated（RLS 路徑會用到），而且切換後讀不到任何人的資料
 *
 *   npm run db:migrate
 *
 * 連線字串：DATABASE_URL_UNPOOLED（Neon 的 direct 連線）優先，否則 DATABASE_URL。
 * migration 會 create role、create extension、grant，需要在非 pooled 連線上執行比較穩。
 */
import { existsSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { listMigrations } from "../src/lib/db/local";

async function main(): Promise<void> {
  const envFile = path.join(process.cwd(), ".env.local");
  if (existsSync(envFile)) process.loadEnvFile(envFile);

  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error("請在 .env.local 或環境變數設定 DATABASE_URL（或 DATABASE_URL_UNPOOLED）");
  const host = new URL(url).hostname;
  if (host.includes("-pooler")) {
    console.warn("注意：這是 pooled 連線字串；建議用 Neon 的 direct 連線（DATABASE_URL_UNPOOLED）跑 migration。");
  }

  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  try {
    const [{ version }] = await sql<{ version: string }[]>`select version()`;
    const migrations = await listMigrations();
    console.log(`連線到 ${host}（${version.split(" on ")[0]}），共 ${migrations.length} 份 migration`);
    for (const m of migrations) {
      process.stdout.write(`  ${m.file} … `);
      await sql.unsafe(m.sql);
      console.log("OK");
    }

    const grants = await sql<{ grantee: string; table_name: string; privs: string }[]>`
      select grantee, table_schema || '.' || table_name as table_name, string_agg(privilege_type, ', ' order by privilege_type) privs
      from information_schema.role_table_grants where table_schema in ('lune', 'auth') and grantee in ('authenticated', 'anon')
      group by 1, 2 order by 2, 1`;
    console.log(
      "authenticated／anon 的表權限（應只有 authenticated，且沒有 auth schema、rate_limits、reminder_sends）：",
    );
    for (const g of grants) console.log(`  ${g.grantee.padEnd(14)} ${g.table_name.padEnd(32)} ${g.privs}`);
    if (
      grants.some(
        (g) =>
          g.grantee === "anon" ||
          g.table_name.startsWith("auth.") ||
          g.table_name === "lune.rate_limits" ||
          g.table_name === "lune.reminder_sends",
      )
    ) {
      throw new Error("權限不符預期");
    }

    // RLS 路徑：連線角色必須能切換成 authenticated，而且沒有身分時讀不到任何資料
    await sql.begin(async (tx) => {
      await tx.unsafe("set local role authenticated");
      for (const table of ["lune.profiles", "lune.periods", "lune.daily_logs", "lune.push_subscriptions"]) {
        const [{ n }] = await tx.unsafe<{ n: number }[]>(`select count(*)::int n from ${table}`);
        if (n !== 0) throw new Error(`切成 authenticated 後仍讀到 ${table} 的 ${n} 筆資料（RLS 沒生效）`);
      }
      await tx.unsafe("reset role");
    });
    console.log("set local role authenticated：OK（RLS 生效）");
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
