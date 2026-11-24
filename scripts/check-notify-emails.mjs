// Test for notification emails: every migration on an empty in-memory database, then checks that the app can't
// read the "last emailed" table, people can flip their own switch, and old notifications count as handled.
// Usage: node scripts/check-notify-emails.mjs
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), "supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const mine = "20261124120000_notify_emails.sql";
const db = new PGlite();
await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon; create role authenticated; create role service_role bypassrls; create role supabase_auth_admin;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
`);
for (const f of files.filter((f) => f < mine)) await db.exec(readFileSync(join(dir, f), "utf8"));

let failed = 0;
const ok = (cond, what) => (cond ? console.log("ok  ", what) : (failed++, console.log("FAIL", what)));
const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
await db.exec(`
  insert into auth.users (id, email) values ('${A}', 'a@example.com'), ('${B}', 'b@example.com');
  insert into public.profiles (id, handle) values ('${A}', 'ana'), ('${B}', 'bo') on conflict (id) do nothing;
  insert into public.notifications (user_id, actor_id, type) values ('${A}', '${B}', 'follow');
`);
await db.exec(readFileSync(join(dir, mine), "utf8"));

const old = (await db.query(`select emailed_at from public.notifications`)).rows;
ok(old.length === 1 && old[0].emailed_at, "notifications from before count as already handled");
await db.exec(`insert into public.notifications (user_id, actor_id, type) values ('${B}', '${A}', 'follow')`);
const fresh = (await db.query(`select emailed_at from public.notifications where user_id = '${B}'`)).rows;
ok(fresh[0].emailed_at === null, "new notifications wait to be emailed");
ok((await db.query(`select email_notify from public.profiles where id = '${A}'`)).rows[0].email_notify === true, "emails are on to start");

await db.exec(`set role authenticated; set request.jwt.claim.sub = '${A}'`);
await db.exec(`update public.profiles set email_notify = false where id = '${A}'`);
let blocked = false;
try { await db.query(`select * from public.notify_emails`); } catch { blocked = true; }
ok(blocked, "the app can't read when people were last emailed");
await db.exec(`reset role`);
ok((await db.query(`select email_notify from public.profiles where id = '${A}'`)).rows[0].email_notify === false, "people can turn their own emails off");

if (failed) process.exit(1);
console.log("all good");
