/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Renumber projects.sort_order to a clean sequential 1..N per type,
 * preserving the current relative order (ORDER BY sort_order, id).
 *
 * Usage: (set DATABASE_URL in shell first)
 *   npx tsx scripts/renumber-sort-order.ts
 */
import { sql } from "drizzle-orm";
import { db } from "../src/lib/db";

async function main() {
  await db.execute(sql`select 1`);

  const rows = await db.execute(sql`
    select id, type, created_at
    from projects
    order by type, sort_order asc, id asc
  `);

  // Renumber sequentially within each type.
  const counters: Record<string, number> = {};
  let updated = 0;
  for (const r of rows) {
    const typeKey = String(r.type ?? "");
    const c = (counters[typeKey] ?? 0) + 1;
    counters[typeKey] = c;
    await db.execute(sql`update projects set sort_order = ${c} where id = ${String(r.id)}`);
    updated++;
  }

  console.log(`Renumbered ${updated} projects to sequential sort_order.`);
  console.log("Counters:", JSON.stringify(counters));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
