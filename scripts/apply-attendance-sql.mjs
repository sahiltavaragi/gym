/**
 * One-off helper: runs SQL files against the linked Supabase project
 * through the Management API (SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_REF
 * from .env). Usage: node scripts/apply-attendance-sql.mjs <file.sql> [...]
 * Never prints credentials.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv(path) {
  const out = {};
  try {
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
  return out;
}

const env = { ...loadEnv(resolve(process.cwd(), ".env")), ...process.env };
const token = env.SUPABASE_ACCESS_TOKEN;
const ref = env.SUPABASE_PROJECT_REF;
if (!token || !ref) {
  console.error("Missing SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_REF");
  process.exit(1);
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("No SQL files given");
  process.exit(1);
}

for (const file of files) {
  const sql = readFileSync(resolve(process.cwd(), file), "utf8");
  console.log(`\n=== Running ${file} (${sql.length} chars) ===`);
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  console.log(`HTTP ${res.status}`);
  // Response contains query results only (rows/notices), never credentials.
  console.log(text.slice(0, 4000));
  if (!res.ok) {
    console.error(`FAILED: ${file}`);
    process.exit(1);
  }
}
console.log("\nAll SQL files applied successfully.");
