// Test for listening and search history: every migration on an empty in-memory database, then example activity.
// Checks the privacy rules (the app can add rows, never read them) and what the insights_* views report.
// Usage (from the repo folder): node scripts/check-history.mjs
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
  -- As on Supabase: the app's roles can run new functions in public unless a migration takes that away.
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`);
for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await db.exec(readFileSync(join(dir, f), "utf8"));

const U = (n) => `00000000-0000-0000-0000-00000000000${n}`;
const S = (n) => `10000000-0000-0000-0000-0000000000${String(n).padStart(2, "0")}`;
await db.exec(`
  insert into auth.users (id) values ('${U(1)}'), ('${U(2)}'), ('${U(3)}');
  insert into public.profiles (id, handle) values ('${U(1)}', 'ann'), ('${U(2)}', 'bob'), ('${U(3)}', 'cat');
  insert into public.shows (id, title, source) values ('show0001', 'Long Talk', 'feed'), ('show0002', 'Quick News', 'feed');
  insert into public.episodes (id, show_id, title, source) values
    ('epA00001', 'show0001', 'A', 'feed'), ('epB00001', 'show0002', 'B', 'feed'), ('epC00001', 'show0002', 'C', 'feed');
  insert into public.briefs (author_id, title, topic) values ('${U(1)}', 'The Midterms', 'midterms');
`);

let failed = 0;
const check = (ok, label) => { console.log(`${ok ? "  ok  " : "  FAIL"} ${label}`); if (!ok) failed++; };
const as = async (user, sql) => {
  await db.exec(user ? `set role authenticated; select set_config('request.jwt.claim.sub', '${U(user)}', false);` : "set role anon;");
  try {
    return await db.query(sql);
  } finally {
    await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false);");
  }
};
const fails = async (user, sql) => as(user, sql).then(() => false, () => true);
const listen = (id, ep, start, end, max, dur, heard, finished, source = "search", skipped = 0) =>
  `select public.record_listen('${S(id)}', '${ep}', now() - interval '1 hour', now(), ${start}, ${end}, ${max}, ${dur}, ${heard}, ${skipped}, ${finished}, '${source}')`;
const search = (id, q, shows = 3, eps = 5) => `select public.record_search('${S(id)}', '${q}', 'all', ${shows}, ${eps}, 0, 0)`;
const tap = (id, pos) => `select public.record_search_tap('${S(id)}', 'episode', 'epA00001', ${pos})`;

// ---- writing ----
// Ann finishes A (3600s); Bob gets 25% into A; Cat finishes A. B (1000s): Ann stops at 15%, Bob at 18%.
await as(1, listen(1, "epA00001", 0, 1800, 1800, 3600, 1800, false));
await as(1, listen(1, "epA00001", 0, 3590, 3590, 3600, 3500, true, "search", 60)); // same session, later: updated in place
await as(2, listen(2, "epA00001", 0, 900, 900, 3600, 900, false, "up_next"));
await as(3, listen(3, "epA00001", 0, 3600, 3600, 3600, 3600, true, "home"));
await as(1, listen(4, "epB00001", 0, 150, 150, 1000, 150, false, "nonsense"));
await as(2, listen(5, "epB00001", 0, 180, 180, 1000, 180, false));
const rows = (await db.query("select * from public.listening_sessions order by id")).rows;
check(rows.length === 5, `one row per session (got ${rows.length})`);
const s1 = rows.find((r) => r.id === S(1));
check(s1.finished && s1.max_position === 3590 && s1.heard_seconds === 3500 && s1.skipped_seconds === 60, "a session is updated in place as it goes");
check(rows.find((r) => r.id === S(4)).source === "other", "an unknown source is saved as 'other'");
check(rows.every((r) => r.user_id), "rows carry the signed-in person");

// Bob can't take over Ann's session.
await as(2, `select public.record_listen('${S(1)}', 'epA00001', now(), now(), 0, 5, 5, 3600, 5, 0, false, 'home')`);
check((await db.query(`select user_id, end_position from public.listening_sessions where id = '${S(1)}'`)).rows[0].end_position === 3590, "someone else can't change your session");

// Searches: "mandela" by 3 people (Ann taps result 1, Bob taps result 8, Cat taps nothing); "midterms" by 2, no taps.
await as(1, search(10, "Mandela")); await as(1, tap(10, 1)); await as(1, tap(10, 4));
await as(2, search(11, "mandela")); await as(2, tap(11, 8));
await as(3, search(12, "MANDELA "));
await as(1, search(13, "midterms")); await as(2, search(14, "midterms"));
await as(3, search(15, "tradwives")); await as(1, search(16, "tradwives"));
const ev = (await db.query(`select * from public.search_events where id = '${S(10)}'`)).rows[0];
check(ev.tapped_position === 1, "only the first tap after a search is kept");
check((await db.query(`select query from public.search_events where id = '${S(12)}'`)).rows[0].query === "MANDELA", "search words are trimmed");

// ---- privacy ----
check(await fails(null, search(20, "x")), "signed-out visitors can't call record_search");
check(await fails(null, `select public.record_search_tap('${S(10)}', 'show', 'x', 1)`), "signed-out visitors can't call record_search_tap");
check(await fails(1, "select * from public.listening_sessions"), "the app can't read listening_sessions, even your own");
check(await fails(1, "select * from public.search_events"), "the app can't read search_events");
check(await fails(1, "insert into public.search_events (id, user_id, query) values (gen_random_uuid(), '" + U(1) + "', 'x')"), "the app can't write to the tables directly");
for (const v of ["insights_finish_rate", "insights_dropoff", "insights_listening_trend", "insights_top_searches", "insights_search_misses", "insights_brief_ideas"]) {
  check(await fails(1, `select * from public.${v}`), `the app can't read ${v}`);
}
check(await fails(1, "select public.prune_history()"), "the app can't run the clean-up");

// ---- what the views report (read as the dashboard does) ----
const view = async (v) => (await db.query(`select * from public.${v}`)).rows;
const fr = await view("insights_finish_rate");
const longTalk = fr.find((r) => r.grouped_by === "show" && r.name === "Long Talk");
const quick = fr.find((r) => r.grouped_by === "show" && r.name === "Quick News");
check(longTalk?.finished_pct === 67 && longTalk.people === 3, `finish rate: Long Talk 67% of 3 people (got ${longTalk?.finished_pct}% of ${longTalk?.people})`);
check(quick?.finished_pct === 0 && quick.avg_furthest_pct === 17, `finish rate: Quick News 0%, average 17% in (got ${quick?.finished_pct}%, ${quick?.avg_furthest_pct}%)`);
check(fr.some((r) => r.grouped_by === "length" && r.name === "45–90 min" && r.listens === 3), "finish rate also by episode length");

const drop = await view("insights_dropoff");
check(drop.some((r) => r.show === "Quick News" && r.stopped_at === "10–20%" && r.listens === 2), "drop-off: both Quick News listens stopped at 10–20%");
check(drop.some((r) => r.show === "Long Talk" && r.stopped_at === "20–30%" && r.listens === 1), "drop-off: Bob stopped Long Talk at 20–30%");
check(!drop.some((r) => r.show === "Long Talk" && r.stopped_at === "90–100%"), "drop-off leaves out finished listens");

const trend = await view("insights_listening_trend");
const ann = trend.find((r) => r.handle === "ann");
check(ann?.minutes === Math.round((3500 + 150) / 60) && ann.finished === 1, `listening trend: ann ${ann?.minutes} minutes, 1 finished`);

const top = await view("insights_top_searches");
check(top[0]?.query === "mandela" && top[0].searches_30d === 3 && top[0].people_30d === 3 && top[0].tapped_pct === 67, `top searches: "mandela" first, 3 people, 67% tapped (got ${JSON.stringify(top[0])})`);

const misses = await view("insights_search_misses");
check(misses.some((r) => r.query === "midterms" && r.no_tap === 2), "misses: \"midterms\" (no taps)");
check(!misses.some((r) => r.query === "mandela"), "misses: \"mandela\" isn't one (most people tapped, near the top on average)");

const ideas = await view("insights_brief_ideas");
check(ideas.some((r) => r.query === "tradwives" && r.people === 2), "brief ideas: \"tradwives\" (2 people, no brief yet)");
check(!ideas.some((r) => r.query === "midterms"), "brief ideas: not \"midterms\" (a brief covers it)");
check(ideas.some((r) => r.query === "mandela"), "brief ideas: \"mandela\"");

// ---- clean-up ----
await db.exec(`update public.search_events set created_at = now() - interval '13 months' where id = '${S(16)}'`);
await db.exec("set role service_role; select public.prune_history(); reset role;");
check((await db.query(`select count(*)::int n from public.search_events where id = '${S(16)}'`)).rows[0].n === 0, "rows older than a year are deleted");
check((await db.query("select count(*)::int n from public.search_events")).rows[0].n === 6, "newer rows stay");

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
