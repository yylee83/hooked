// Test for invite links: every migration on an empty in-memory database, then checks that a link lets a new email
// sign up (no limit), counts it, makes the new person follow the sender, and that a replaced link stops working.
// Usage: node scripts/check-invites.mjs
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
const MAYA = "00000000-0000-0000-0000-00000000000a";
for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await db.exec(readFileSync(join(dir, f), "utf8"));
await db.exec(`insert into auth.users values ('${MAYA}', 'maya@x.com'); insert into public.profiles (id, handle) values ('${MAYA}', 'maya');`);

let failed = 0;
const ok = (cond, what) => (cond ? console.log("ok  ", what) : (failed++, console.log("FAIL", what)));
const as = async (uid, sql) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try { return (await db.query(sql)).rows; } finally { await db.exec(`reset role`); }
};
let n = 0;
const signUp = async (code) => {
  n++;
  const id = `00000000-0000-0000-0001-${String(n).padStart(12, "0")}`;
  const ev = { user: { id, email: `Friend${n}@Example.com`, user_metadata: code ? { invite: code } : {} } };
  const r = (await db.query(`select public.hook_invite_gate($1::jsonb) as r`, [JSON.stringify(ev)])).rows[0].r;
  return r.error ? null : id;
};

const [mine] = await as(MAYA, `select * from public.my_invite()`);
ok(/^[a-z0-9]{10}$/.test(mine.code) && mine.joined === 0, "Maya gets a link");
const [again] = await as(MAYA, `select * from public.my_invite()`);
ok(again.code === mine.code, "asking again gives the same link");

await db.exec(`set role anon`);
const info = (await db.query(`select * from public.invite_info($1)`, [mine.code.toUpperCase()])).rows[0];
await db.exec(`reset role`);
ok(info?.handle === "maya" && info.open === true, "anyone can see who sent a link");

ok(!(await signUp(null)), "no link, not on the list: refused");
ok(!(await signUp("nope123456")), "made-up link: refused");
const ids = [];
for (let i = 0; i < 8; i++) ids.push(await signUp(mine.code));
ok(ids.every(Boolean), "8 friends sign up with one link (no limit)");
const allowed = (await db.query(`select count(*)::int c from public.allowed_emails where note like 'invite link%' and email = lower(email)`)).rows[0].c;
ok(allowed === 8, "joined friends are on the invite list, in lower case");

// The first friend's account and profile get made: they follow Maya, and Maya gets a follow notification.
await db.exec(`insert into auth.users values ('${ids[0]}', 'friend1@example.com'); insert into public.profiles (id) values ('${ids[0]}');`);
const f = (await db.query(`select 1 from public.follows where follower_id = $1 and followee_id = $2`, [ids[0], MAYA])).rows;
ok(f.length === 1, "the new friend follows Maya");
const note = (await db.query(`select 1 from public.notifications where user_id = $1 and actor_id = $2 and type = 'follow'`, [MAYA, ids[0]])).rows;
ok(note.length === 1, "Maya is notified");
const [count] = await as(MAYA, `select * from public.my_invite()`);
ok(count.joined === 8, "Maya sees 8 joined");

const [fresh] = await as(MAYA, `select * from public.my_invite(true)`);
ok(fresh.code !== mine.code && fresh.joined === 8, "a new link keeps the count");
ok(!(await signUp(mine.code)), "the old link stops working");
ok(await signUp(fresh.code), "the new link works");
await db.exec(`set role anon`);
const old = (await db.query(`select * from public.invite_info($1)`, [mine.code])).rows[0];
await db.exec(`reset role`);
ok(old && old.open === false, "the replaced link shows as closed");

let blocked = false;
try { await as(MAYA, `select * from public.invite_uses`); } catch { blocked = true; }
ok(blocked, "the app can't read who joined");
blocked = false;
try { await db.exec(`set role anon`); await db.query(`select * from public.my_invite()`); } catch { blocked = true; } finally { await db.exec(`reset role`); }
ok(blocked, "signed out can't make links");

if (failed) process.exit(1);
console.log("all good");
