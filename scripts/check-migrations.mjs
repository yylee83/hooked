// Check that every migration applies cleanly, in order, to an empty database.
// Runs on a small in-memory Postgres (PGlite), so it needs no Docker and no network.
// Usage: npm run db:check
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), "supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

const db = new PGlite();
// Stand-ins for what Supabase provides on every project.
await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon; create role authenticated; create role service_role; create role supabase_auth_admin;
`);

for (const f of files) {
  try {
    await db.exec(readFileSync(join(dir, f), "utf8"));
    console.log(`ok    ${f}`);
  } catch (e) {
    console.error(`FAIL  ${f}\n      ${e.message}`);
    process.exit(1);
  }
}
console.log(`\n${files.length} migration(s) applied cleanly.`);
