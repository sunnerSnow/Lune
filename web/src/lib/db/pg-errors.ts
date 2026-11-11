/**
 * 取出 Postgres 錯誤碼與約束名稱。
 * Drizzle 會把驅動的錯誤包在 cause 裡；postgres.js 用 constraint_name，PGlite 用 constraint。
 */
interface PgLikeError {
  code?: string;
  constraint?: string;
  constraint_name?: string;
  cause?: unknown;
}

function findPgError(error: unknown): PgLikeError | null {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth++) {
    const e = current as PgLikeError;
    if (typeof e.code === "string" && /^[0-9A-Z]{5}$/.test(e.code)) return e;
    current = e.cause;
  }
  return null;
}

function matches(error: unknown, code: string, constraint?: string): boolean {
  const e = findPgError(error);
  if (!e || e.code !== code) return false;
  return constraint === undefined || (e.constraint ?? e.constraint_name) === constraint;
}

export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  return matches(error, "23505", constraint);
}

/** 排除約束（例如經期日期重疊） */
export function isExclusionViolation(error: unknown, constraint?: string): boolean {
  return matches(error, "23P01", constraint);
}

export function isForeignKeyViolation(error: unknown, constraint?: string): boolean {
  return matches(error, "23503", constraint);
}

export function isCheckViolation(error: unknown, constraint?: string): boolean {
  return matches(error, "23514", constraint);
}
