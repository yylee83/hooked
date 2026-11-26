// Test for the security fixes (supabase/migrations/20261126120000_security_fixes.sql): every migration on an empty
// in-memory database with Supabase's default grants, then: saving a list can't create made-up episodes; "listening
// now" keeps only real episodes from our tables; who you sent a log to is private; long names are refused.
// Usage (from the repo folder): node scripts/check-security.mjs
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
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
`);
for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await db.exec(readFileSync(join(dir, f), "utf8"));

let failed = 0;
const check = (ok, label) => { console.log(`${ok ? "  ok  " : "  FAIL"} ${label}`); if (!ok) failed++; };
const U = (n) => `00000000-0000-0000-0000-00000000000${n}`;
await db.exec(`
  insert into auth.users (id) values ('${U(1)}'), ('${U(2)}');
  insert into public.profiles (id, handle) values ('${U(1)}', 'ann'), ('${U(2)}', 'bob');
  insert into public.shows (id, title, image_url, podcastindex_id, source) values ('show0001', 'A Show', 'https://img/show.jpg', 77, 'feed');
  insert into public.episodes (id, show_id, title, podcastindex_id, source) values ('epa22222', 'show0001', 'An Episode', 555, 'feed');
`);
const as = async (user, sql) => {
  const role = user ? "authenticated" : "anon";
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${user ? U(user) : ""}', false);`);
  try { return await db.query(sql); } finally { await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false);"); }
};
const err = (user, sql) => as(user, sql).then(() => null, (e) => e);
const one = async (sql) => (await db.query(sql)).rows[0];
const count = async (sql) => Number((await db.query(sql)).rows[0].n);

// ---- 1. Lists can't plant episodes ----
const before = await count(`select count(*) n from public.episodes`);
const items = JSON.stringify([
  { episodeId: 999999, feedId: 888888, episode: "FAKE EPISODE", show: "Fake Show", audio: "https://evil.example/a.mp3", episodeRef: "zzzzzzzz" },
  { episodeId: 555, feedId: 77, episode: "An Episode" },
]);
const e1 = await err(1, `insert into public.briefs (title, topic, mode, items) values ('My list', 'stuff', 'full', '${items}')`); if (e1) console.log(e1.message);
check(!e1, "Ann can save a list");
check((await count(`select count(*) n from public.episodes`)) === before, "saving a list creates no episodes");
check((await count(`select count(*) n from public.shows where podcastindex_id = 888888`)) === 0, "or shows");
const saved = (await one(`select items from public.briefs where author_id = '${U(1)}'`)).items;
check(!saved[0].episodeRef, "a made-up episode id isn't kept");
check(saved[1].episodeRef === "epa22222" && saved[1].showRef === "show0001", "a real episode gets our ids");
const many = JSON.stringify(Array.from({ length: 51 }, (_, i) => ({ episode: `e${i}` })));
check(!!(await err(1, `insert into public.briefs (title, topic, mode, items) values ('Big', 'stuff', 'full', '${many}')`)), "a list of 51 episodes is refused");

// ---- 2. Listening now ----
await as(1, `update public.profiles set now_playing = '{"ref":"epa22222","title":"I AM A FAKE TITLE","image":"https://evil.example/x.png"}', now_playing_at = now() + interval '1 year' where id = '${U(1)}'`);
let p = await one(`select now_playing, now_playing_at <= now() as clamped from public.profiles where id = '${U(1)}'`);
check(p.now_playing.title === "An Episode" && p.now_playing.image === "https://img/show.jpg" && p.now_playing.feedTitle === "A Show", "listening now uses our own title and cover");
check(p.clamped, "listening now can't be dated in the future");
await as(1, `update public.profiles set now_playing = '{"id":555}' where id = '${U(1)}'`);
p = await one(`select now_playing from public.profiles where id = '${U(1)}'`);
check(p.now_playing.ref === "epa22222", "a Podcast Index number finds our episode");
await as(1, `update public.profiles set now_playing = '{"ref":"nothere2","title":"Spam"}' where id = '${U(1)}'`);
p = await one(`select now_playing from public.profiles where id = '${U(1)}'`);
check(p.now_playing === null, "an episode we don't have is cleared");
check(!!(await err(1, `update public.profiles set display_name = repeat('a', 101) where id = '${U(1)}'`)), "a 101-letter name is refused");
check(!(await err(1, `update public.profiles set display_name = 'Ann Lee' where id = '${U(1)}'`)), "a normal name is fine");

// ---- 3. Sends on logs are private ----
check(!(await err(1, `insert into public.logs (episode_ref, rating, hook, sent_to) values ('epa22222', 4, 'Good', '["bob"]')`)), "Ann can log (an old app still sending sent_to)");
check(!(await err(1, `insert into public.logs (episode_ref, rating, hook, sent_to) values ('epa22222', 5, 'Great', '["bob","cat"]') on conflict (user_id, episode_ref) do update set rating = excluded.rating, hook = excluded.hook, sent_to = excluded.sent_to`)), "Ann can update her log (upsert)");
const log = (await as(0, `select hook, sent_to from public.logs`)).rows[0];
check(log?.hook === "Great", "reviews stay public");
check(JSON.stringify(log?.sent_to) === "[]", "who she sent it to isn't kept on the log");
check(!!(await err(1, `select * from public.log_sends_archive`)) && !!(await err(0, `select * from public.log_sends_archive`)), "the archive of old sends is team-only");
check(!(await err(2, `insert into public.recommendations (to_id, episode_ref) values ('${U(1)}', 'epa22222')`)), "sends still work");
check((await as(1, `select count(*) n from public.recommendations`)).rows[0].n == 1 && (await as(0, `select count(*) n from public.recommendations`)).rows[0].n == 0, "and only the two people can see them");

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log("\nall good");
