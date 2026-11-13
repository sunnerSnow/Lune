/** db.execute(sql`...`) 的結果：postgres.js 回陣列，PGlite 回 { rows } */
export function rowsOf<T>(result: unknown): T[] {
  return (Array.isArray(result) ? result : ((result as { rows?: T[] }).rows ?? [])) as T[];
}
