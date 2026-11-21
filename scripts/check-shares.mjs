// Test for share tracking (supabase/migrations/20261122120000_share_events.sql): every migration on an empty in-memory
// database, then example shares. Checks the privacy rules (the app can add shares, never read them), the double-tap
// and daily limits, the insights_shares_* views, and that outside shares count in both trending functions.
// Usage (from the repo folder): node scripts/check-shares.mjs
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
await db.exec(`
  insert into auth.users (id) values ('${U(1)}'), ('${U(2)}'), ('${U(3)}');
  insert into public.profiles (id, handle) values ('${U(1)}', 'ann'), ('${U(2)}', 'bob'), ('${U(3)}', 'cat');
  insert into public.shows (id, title, source) values ('show0001', 'Long Talk', 'feed'), ('show0002', 'Quick News', 'feed');
  insert into public.episodes (id, show_id, title, source, audio_url) values
    ('epA00001', 'show0001', 'A', 'feed', 'https://example.com/a.mp3'), ('epB00001', 'show0002', 'B', 'feed', 'https://example.com/b.mp3');
  insert into public.briefs (id, author_id, title, topic) values ('20000000-0000-0000-0000-000000000001', '${U(1)}', 'The Midterms', 'midterms');
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
const share = (kind, ref, method, review = false) => `select public.record_share('${kind}', '${ref}', '${method}', ${review})`;
const count = async (where = "true") => Number((await db.query(`select count(*)::int as n from public.share_events where ${where}`)).rows[0].n);

// ---- writing ----
await as(1, share("episode", "epA00001", "messages", true));
await as(1, share("episode", "epA00001", "messages")); // a double tap: counts once
await as(1, share("episode", "epA00001", "copy"));
await as(2, share("episode", "epA00001", "share_menu"));
await as(3, share("brief", "20000000-0000-0000-0000-000000000001", "whatsapp"));
await as(3, share("brief", "changed-my-life", "copy"));
check((await count()) === 5, `five shares saved, the double tap once (got ${await count()})`);
check((await count("with_review")) === 1, "a share with your own review is marked");
check((await count("kind = 'brief'")) === 2 && (await count("brief_slug = 'changed-my-life'")) === 1, "listeners' briefs and built-in briefs can be shared");
await as(1, share("episode", "nothere1", "copy"));
await as(1, share("episode", "epB00001", "carrier-pigeon"));
await as(1, share("brief", "Not A Brief!", "copy"));
check((await count()) === 5, "unknown episodes, briefs or ways of sharing are ignored");

// ---- privacy ----
check(await fails(null, share("episode", "epB00001", "copy")), "signed-out visitors can't call record_share");
check(await fails(1, "select * from public.share_events"), "the app can't read share_events, even your own");
check(await fails(1, "insert into public.share_events (user_id, kind, episode_ref, method) values ('" + U(1) + "', 'episode', 'epB00001', 'copy')"), "the app can't write share_events directly");
check(await fails(1, "select * from public.insights_shares_daily"), "the app can't read insights_shares_daily");
check(await fails(null, "select * from public.insights_shares_top"), "signed-out visitors can't read insights_shares_top");
check(await fails(1, "select public.prune_history()"), "the app can't run prune_history");

// ---- daily limit ----
await db.exec(`insert into public.share_events (user_id, kind, episode_ref, method, created_at)
  select '${U(3)}', 'episode', 'epB00001', 'copy', now() - interval '1 hour' from generate_series(1, 200)`);
await as(3, share("episode", "epA00001", "email"));
check((await count(`user_id = '${U(3)}' and method = 'email'`)) === 0, "at most 200 shares a day per person");
await db.exec(`delete from public.share_events where user_id = '${U(3)}' and kind = 'episode'`);

// ---- reading ----
await db.exec(`insert into public.recommendations (from_id, to_id, episode_ref) values ('${U(2)}', '${U(1)}', 'epA00001'), ('${U(2)}', '${U(3)}', 'epA00001')`);
const today = (await db.query("select * from public.insights_shares_daily order by day desc limit 1")).rows[0];
check(today.inside_shares === 1 && today.inside_recipients === 2, `a send to two friends is 1 inside share, 2 recipients (got ${today.inside_shares}, ${today.inside_recipients})`);
check(today.outside_shares === 5 && today.via_messages === 1 && today.via_copy_link === 2 && today.via_share_menu === 1 && today.via_whatsapp === 1, "outside shares by how");
check(today.outside_brief_shares === 2, "brief shares are counted");
const top = (await db.query("select * from public.insights_shares_top")).rows;
check(top[0]?.episode === "A" && top[0].inside_shares === 1 && top[0].outside_shares === 3 && top[0].people === 2, `top shared: A, inside 1, outside 3, 2 people (got ${JSON.stringify(top[0])})`);

// ---- trending ----
const te = (await db.query("select * from public.trending_episodes(10)")).rows.find((r) => r.episode_ref === "epA00001");
check(te && te.sends >= 4 && te.people === 2, `trending episodes counts outside shares as sharing (got sends ${te?.sends}, people ${te?.people})`);
await db.exec(`insert into public.logs (user_id, episode_ref, hook) values ('${U(3)}', 'epB00001', 'Great one')`);
await as(1, share("episode", "epB00001", "copy"));
const tc = (await db.query("select * from public.trending_conversations(10)")).rows.find((r) => r.episode_ref === "epB00001");
check(tc && tc.people === 2 && tc.sends === 1, `trending conversations counts an outside share (got ${JSON.stringify(tc && { people: tc.people, sends: tc.sends })})`);

console.log(failed ? `\n${failed} check(s) failed.` : "\nAll share checks passed.");
process.exit(failed ? 1 : 0);
