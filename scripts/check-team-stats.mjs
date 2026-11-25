// Test for the team stats page (/stats): every migration on an empty in-memory database, then example activity.
// Checks that only team members can read team_stats(), that it reports the right totals, and that time in the app
// (record_app_minute) counts each minute once and can't be read back by the app.
// Usage (from the repo folder): node scripts/check-team-stats.mjs
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
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
`);
for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await db.exec(readFileSync(join(dir, f), "utf8"));

const U = (n) => `00000000-0000-0000-0000-00000000000${n}`;
const S = (n) => `10000000-0000-0000-0000-0000000000${String(n).padStart(2, "0")}`;
await db.exec(`
  insert into auth.users (id) values ('${U(1)}'), ('${U(2)}'), ('${U(3)}');
  insert into public.profiles (id, handle, created_at) values
    ('${U(1)}', 'erin', now() - interval '40 days'), ('${U(2)}', 'bob', now() - interval '2 hours'), ('${U(3)}', 'cat', now() - interval '3 days');
  insert into public.team_members (user_id) values ('${U(1)}');
  insert into public.shows (id, title, source) values ('show0001', 'Long Talk', 'feed'), ('show0002', 'Quick News', 'feed');
  insert into public.episodes (id, show_id, title, source) values
    ('epA00001', 'show0001', 'A', 'feed'), ('epB00001', 'show0002', 'B', 'feed');
  insert into public.logs (user_id, episode_ref, hooked, hook, rating, logged_at) values
    ('${U(2)}', 'epA00001', true, 'so good', 5, now() - interval '1 hour'),
    ('${U(3)}', 'epA00001', true, null, 4, now() - interval '1 hour'),
    ('${U(3)}', 'epB00001', true, 'old', 3, now() - interval '60 days');
  insert into public.comments (log_user_id, episode_ref, author_id, body) values ('${U(2)}', 'epA00001', '${U(3)}', 'yes');
  insert into public.listening_sessions (id, user_id, episode_ref, started_at, ended_at, heard_seconds, finished) values
    ('${S(1)}', '${U(2)}', 'epA00001', now() - interval '1 hour', now(), 1800, true),
    ('${S(2)}', '${U(3)}', 'epA00001', now() - interval '1 hour', now(), 600, false),
    ('${S(3)}', '${U(3)}', 'epB00001', now() - interval '1 hour', now(), 600, false);
  insert into public.search_events (id, user_id, query) values ('${S(4)}', '${U(2)}', 'Serial'), ('${S(5)}', '${U(3)}', 'serial ');
  insert into public.waitlist (email) values ('w@example.com');
`);

let failed = 0;
const check = (ok, label) => { console.log(`${ok ? "  ok  " : "  FAIL"} ${label}`); if (!ok) failed++; };
const as = async (user, sql) => {
  await db.exec(user ? `set role authenticated; select set_config('request.jwt.claim.sub', '${U(user)}', false);` : "set role anon;");
  try { return await db.query(sql); } finally { await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false);"); }
};
const fails = async (user, sql) => as(user, sql).then(() => false, () => true);

// Time in the app: bob twice in the same minute counts once; cat once.
await as(2, "select public.record_app_minute()");
await as(2, "select public.record_app_minute()");
await as(3, "select public.record_app_minute()");
check((await db.query("select count(*)::int as n from public.app_minutes")).rows[0].n === 2, "time in the app: one row per person per minute");
check(await fails(2, "select * from public.app_minutes"), "the app can't read time in the app");
check(await fails(2, "select * from public.team_members"), "the app can't read the team list");
check(await fails(2, "insert into public.team_members (user_id) values ('" + U(2) + "')"), "the app can't add itself to the team");
check(await fails(null, "select public.record_app_minute()"), "signed-out visitors can't record minutes");

check(await fails(null, "select public.team_stats(7, 'UTC')"), "signed-out visitors can't read stats");
check(await fails(2, "select public.team_stats(7, 'UTC')"), "someone not on the team can't read stats");

const st = (await as(1, "select public.team_stats(7, 'America/New_York') as s")).rows[0].s;
check(st.tz === "America/New_York" && st.days === 7 && st.daily.length === 7, `7 days in the viewer's time zone (got ${st.daily.length})`);
const p = st.period;
check(p.signups === 2, `sign-ups this week: 2 (got ${p.signups})`);
check(p.active === 2, `active people: 2 (got ${p.active})`);
check(p.logs === 2 && p.reviews === 1 && p.replies === 1, `logs 2, reviews 1, replies 1 (got ${p.logs}, ${p.reviews}, ${p.replies})`);
check(p.plays === 3 && p.listeners === 2 && p.minutes === 50 && p.finishes === 1, `plays 3, listeners 2, 50 min, 1 finish (got ${p.plays}, ${p.listeners}, ${p.minutes}, ${p.finishes})`);
check(p.app_minutes === 2 && p.app_people === 2 && p.app_person_days === 2, `app: 2 minutes, 2 people (got ${p.app_minutes}, ${p.app_people})`);
check(st.all_time.people === 3 && st.all_time.logs === 3 && st.all_time.waitlist === 1, "all-time totals");
check(st.top_episodes[0]?.id === "epA00001" && st.top_episodes[0].listeners === 2 && Number(st.top_episodes[0].avg_rating) === 4.5, "top episode is A, 2 listeners, 4.5 stars");
check(st.top_shows[0]?.title === "Long Talk" && st.top_shows[0].minutes === 40, `top show by minutes is Long Talk (got ${st.top_shows[0]?.title})`);
check(st.top_searches[0]?.query === "serial" && st.top_searches[0].times === 2, "searches grouped ignoring case and spaces");
check(!JSON.stringify(st).includes("@example.com"), "no email addresses in the stats");
const tp = st.top_people || [];
check(tp[0]?.handle === "cat" && tp[0].logs === 1 && tp[0].replies === 1 && tp[0].minutes === 20, `most active: @cat first (got @${tp[0]?.handle})`);
check(tp.length === 2 && !tp.some((x) => x.handle === "erin"), "only people who did something this week");
const bad = (await as(1, "select public.team_stats(9999, 'Not/AZone') as s")).rows[0].s;
check(bad.tz === "UTC" && bad.days === 365, "unknown time zone falls back to UTC; days capped at 365");

console.log(failed ? `\n${failed} check(s) failed.` : "\nAll checks passed.");
process.exit(failed ? 1 : 0);
