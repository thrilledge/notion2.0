#!/usr/bin/env tsx
/**
 * Notion -> app migration runner.
 *
 * Usage:
 *   tsx scripts/migrate-notion.ts --dry-run   # parse + report, no DB writes
 *   tsx scripts/migrate-notion.ts             # full migration
 */
import path from "node:path";
import fs from "node:fs";
import { migrate } from "./notion-migration/db";

// Load .env.local so DATABASE_URL etc. are available (tsx does not do this).
const envLocal = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envLocal)) {
  try {
    process.loadEnvFile(envLocal);
  } catch (err) {
    console.warn("Could not load .env.local:", err);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");

  try {
    const result = await migrate({ dryRun });
    console.log("\n=== Migration summary ===");
    for (const [k, v] of Object.entries(result)) {
      console.log(`${k}: ${v}`);
    }
  } catch (err) {
    console.error("\nMigration failed:");
    console.error(err);
    process.exitCode = 1;
  }
}

main();
