// Test for the waitlist: every migration on an empty in-memory database, then checks that anyone can join,
// nobody can read it back, and bad or repeat emails are ignored. Usage: node scripts/check-waitlist.mjs
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), "supabase", "migrations");
const db = new PGlite();
await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon; create role authenticated; create role service_role bypassrls; create role supabase_auth_admin;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`);
for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await db.exec(readFileSync(join(dir, f), "utf8"));

let failed = 0;
const ok = (cond, what) => (cond ? console.log("ok  ", what) : (failed++, console.log("FAIL", what)));

await db.exec(`set role anon`);
await db.exec(`select public.join_waitlist('  New.Person@Example.com ')`);
await db.exec(`select public.join_waitlist('new.person@example.com')`);
await db.exec(`select public.join_waitlist('not an email')`);
let blocked = false;
try { await db.query(`select * from public.waitlist`); } catch { blocked = true; }
ok(blocked, "the app can't read the waitlist");
await db.exec(`reset role`);
const rows = (await db.query(`select email from public.waitlist`)).rows;
ok(rows.length === 1 && rows[0].email === "new.person@example.com", "one row, in lower case; bad email ignored");

if (failed) process.exit(1);
console.log("all good");
