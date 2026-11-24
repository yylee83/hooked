// Test for "Your reach" (influence stats): every migration on an empty in-memory database, then checks that a + on
// someone's review and queuing an episode someone sent you are recorded for the right person, never shrink when Up next
// or the send goes away, that my_reach() gives only your own totals, and that only the team can read the record.
// Usage: node scripts/check-influence.mjs
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), "supabase", "migrations");
const db = new PGlite();
// Like Supabase: functions and tables are granted to anon and authenticated by default, so revokes must be explicit.
await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon; create role authenticated; create role service_role bypassrls; create role supabase_auth_admin;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
`);
for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await db.exec(readFileSync(join(dir, f), "utf8"));

const A = "00000000-0000-0000-0000-00000000000a"; // the reviewer / sender
const B = "00000000-0000-0000-0000-00000000000b"; // the friend who gets influenced
const C = "00000000-0000-0000-0000-00000000000c"; // another sender
const EP = "ep000001";
await db.exec(`
  insert into auth.users values ('${A}', 'a@x.com'), ('${B}', 'b@x.com'), ('${C}', 'c@x.com');
  insert into public.profiles (id, handle) values ('${A}', 'ana'), ('${B}', 'ben'), ('${C}', 'cy');
  insert into public.shows (id, title, source) values ('show0001', 'A show', 'legacy');
  insert into public.episodes (id, show_id, title, source) values ('${EP}', 'show0001', 'An episode', 'legacy');
  insert into public.logs (user_id, episode_ref, rating, hook) values ('${A}', '${EP}', 5, 'So good'); -- A's review
`);

let failed = 0;
const ok = (cond, what) => (cond ? console.log("ok  ", what) : (failed++, console.log("FAIL", what)));
const as = async (uid, sql) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try { return (await db.query(sql)).rows; } finally { await db.exec(`reset role`); }
};
const reach = async (uid) => (await as(uid, `select public.my_reach() as r`))[0].r;
const same = (r, people, added) => r && r.people === people && r.added === added;
const blocked = async (role, sql) => {
  try { await db.exec(`set role ${role}`); await db.query(sql); return false; } catch { return true; } finally { await db.exec(`reset role`); }
};

// + on a review
await as(B, `insert into public.reactions (log_user_id, user_id, kind, episode_ref) values ('${A}', '${B}', 'adding', '${EP}')`);
ok(same(await reach(A), 1, 1), "B taps + on A's review: A has 1 person, 1 episode");
await as(A, `insert into public.reactions (log_user_id, user_id, kind, episode_ref) values ('${A}', '${A}', 'adding', '${EP}')`);
ok((await db.query(`select 1 from public.influences where influencer_id = user_id`)).rows.length === 0, "+ on your own review gives no credit");
await as(B, `delete from public.reactions where user_id = '${B}' and log_user_id = '${A}' and kind = 'adding'`);
ok(same(await reach(A), 0, 0), "B untaps +: A back to 0");

// Sends, then queuing
await as(A, `insert into public.recommendations (to_id, episode_ref) values ('${B}', '${EP}')`);
await as(C, `insert into public.recommendations (to_id, episode_ref) values ('${B}', '${EP}')`);
await as(B, `insert into public.list_items (item_key, episode_ref) values ('${EP}', '${EP}')`);
ok(same(await reach(A), 1, 1) && same(await reach(C), 1, 1), "B queues an episode A and C both sent: each gets 1 and 1");
await as(B, `delete from public.list_items where item_key = '${EP}'`);
await as(A, `delete from public.recommendations where from_id = '${A}'`);
ok(same(await reach(A), 1, 1), "B plays it (Up next row gone) and A's send is deleted: A keeps the credit");
await as(B, `insert into public.reactions (log_user_id, user_id, kind, episode_ref) values ('${A}', '${B}', 'adding', '${EP}')`);
ok(same(await reach(A), 1, 1), "B also taps + on A's review of the same episode: still 1 person, 1 episode");
ok(same(await reach(B), 0, 0), "my_reach as B gives B's totals, not A's");

// Who can read what
ok(await blocked("anon", `select public.my_reach()`), "anon can't run my_reach");
ok(await blocked("authenticated", `select * from public.influences`), "signed-in people can't read the record");
ok(await blocked("authenticated", `select * from public.insights_influence`), "signed-in people can't read the team view");
ok(await blocked("authenticated", `insert into public.influences values ('${A}', '${B}', '${EP}', 'send', now())`), "signed-in people can't write the record");

// The team view: listened = logged after the moment
const row = async (h) => (await db.query(`select * from public.insights_influence where handle = $1`, [h])).rows[0];
ok((await row("ana"))?.listened === 0 && (await row("ana"))?.added === 1, "team view: A added 1, listened 0");
await as(B, `insert into public.logs (user_id, episode_ref, rating, logged_at) values ('${B}', '${EP}', 4, now() + interval '1 minute')`);
ok((await row("ana"))?.listened === 1 && (await row("ana"))?.listened_people === 1, "team view: B logs it afterwards, A listened 1");

if (failed) {
  console.log(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nAll influence checks passed");
