import { env } from "cloudflare:workers";
import migration0000 from "../drizzle/0000_lovely_bill_hollister.sql?raw";
import migration0001 from "../drizzle/0001_chemical_wolfsbane.sql?raw";
import migration0002 from "../drizzle/0002_naive_justin_hammer.sql?raw";
import migration0003 from "../drizzle/0003_new_infant_terrible.sql?raw";
import migration0004 from "../drizzle/0004_market_arena_v7.sql?raw";

const migrations = [
  ["0000_lovely_bill_hollister", migration0000],
  ["0001_chemical_wolfsbane", migration0001],
  ["0002_naive_justin_hammer", migration0002],
  ["0003_new_infant_terrible", migration0003],
  ["0004_market_arena_v7", migration0004],
] as const;

let pending: Promise<void> | undefined;

export function ensureSchema(): Promise<void> {
  pending ??= apply().catch((error: unknown) => {
    pending = undefined;
    throw error;
  });
  return pending;
}

function statements(sql: string) {
  return sql
    .split("--> statement-breakpoint")
    .map((statement) => statement
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n")
      .trim()
      .replace(/;+\s*$/, ""))
    .filter((statement) => statement.length > 0);
}

function ignorable(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /already exists|duplicate column name/i.test(message);
}

async function apply() {
  if (!env.DB) throw new Error("Market database unavailable");
  const database = env.DB;
  await database.exec("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY NOT NULL)");
  for (const [name, sql] of migrations) {
    const applied = await database.prepare("SELECT name FROM schema_migrations WHERE name = ?").bind(name).first();
    if (applied) continue;
    for (const statement of statements(sql)) {
      const compact = statement.replace(/\s+/g, " ").trim().replace(/;+$/, "");
      try {
        await database.prepare(`${compact};`).run();
      } catch (error) {
        if (!ignorable(error)) throw error;
      }
    }
    await database.prepare("INSERT OR IGNORE INTO schema_migrations (name) VALUES (?)").bind(name).run();
  }
}
