// Rehearse new migrations on a copy of the live data, in memory (nothing is sent anywhere).
// Loads a live export (scripts/export-live.sql) into a database that has every migration up to and
// including <last-applied>, then applies the newer ones and runs the checks in <checks.sql>, if given.
//
// Usage: node scripts/rehearse-migrations.mjs <export.json> <last-applied-migration> [checks.sql]
//   e.g. node scripts/rehearse-migrations.mjs ~/claude/hooked-backups/live.json 20261102120000 checks.sql
//
// A check is any statement; one that raises an error fails the rehearsal. To act as a signed-in
// person, a check can run: select set_config('request.jwt.claim.sub', '<user id>', true); set local role authenticated;
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const [bundlePath, lastApplied, checksPath] = process.argv.slice(2);
if (!bundlePath || !lastApplied) {
  console.error("Usage: node scripts/rehearse-migrations.mjs <export.json> <last-applied-migration> [checks.sql]");
  process.exit(1);
}
const bundle = JSON.parse(readFileSync(bundlePath, "utf8"));
const dir = join(process.cwd(), "supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const before = files.filter((f) => f.slice(0, 14) <= lastApplied);
const after = files.filter((f) => f.slice(0, 14) > lastApplied);

const db = new PGlite();
await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key, email text, created_at timestamptz, email_confirmed_at timestamptz);
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon; create role authenticated; create role service_role bypassrls; create role supabase_auth_admin;
  grant usage on schema public to anon, authenticated;
  grant usage on schema auth to anon, authenticated; -- as on Supabase, so checks can call auth.uid()
`);
for (const f of before) await db.exec(readFileSync(join(dir, f), "utf8"));
await db.exec(`grant select, insert, update, delete on all tables in schema public to anon, authenticated;
  revoke insert, update, delete on public.shows, public.episodes from anon, authenticated;`);
console.log(`Database at ${lastApplied} (${before.length} migrations).`);

// Load the copy with triggers and links paused, as a restore would.
const order = ["shows", "episodes", "profiles", "logs", "hooked_shows", "list_items", "briefs", "follows",
  "recommendations", "comments", "reactions", "notifications", "allowed_emails", "trending_topics"];
await db.exec("set session_replication_role = replica");
await db.query("insert into auth.users select * from json_populate_recordset(null::auth.users, $1)", [JSON.stringify(bundle.users || [])]);
for (const t of order) {
  const rows = bundle[t] || [];
  if (!rows.length) continue;
  const { rows: cols } = await db.query(
    `select column_name from information_schema.columns
     where table_schema = 'public' and table_name = $1 and is_generated = 'NEVER' order by ordinal_position`, [t]);
  const list = cols.map((c) => `"${c.column_name}"`).join(", ");
  await db.query(`insert into public.${t} (${list}) select ${list} from json_populate_recordset(null::public.${t}, $1)`, [JSON.stringify(rows)]);
}
await db.exec("set session_replication_role = origin");
const counts = await Promise.all(order.map(async (t) => `${t} ${(await db.query(`select count(*)::int n from public.${t}`)).rows[0].n}`));
console.log(`Loaded the copy taken ${bundle.taken_at}: ${counts.join(", ")}.`);

for (const f of after) {
  try {
    await db.exec(readFileSync(join(dir, f), "utf8"));
    console.log(`ok    ${f}`);
  } catch (e) {
    console.error(`FAIL  ${f}\n      ${e.message}`);
    process.exit(1);
  }
}
const countsAfter = await Promise.all(order.map(async (t) => `${t} ${(await db.query(`select count(*)::int n from public.${t}`)).rows[0].n}`));
console.log(`After: ${countsAfter.join(", ")}.`);

if (checksPath) {
  // Each check runs in its own transaction, rolled back afterwards, so checks don't affect each other.
  const checks = readFileSync(checksPath, "utf8").split(/^-- check: /m).slice(1);
  let failed = 0;
  for (const c of checks) {
    const [name, ...body] = c.split("\n");
    try {
      await db.exec(`begin;\n${body.join("\n")}\nrollback;`);
      console.log(`pass  ${name.trim()}`);
    } catch (e) {
      await db.exec("rollback").catch(() => {});
      console.error(`FAIL  ${name.trim()}\n      ${e.message}`);
      failed++;
    }
  }
  if (failed) process.exit(1);
}
console.log("\nRehearsal finished cleanly.");
