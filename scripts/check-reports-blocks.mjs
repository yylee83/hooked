// Test for reporting and blocking (supabase/migrations/20261124200000_reports_blocks.sql): every migration on an empty
// in-memory database, then: blocking unfollows both ways and stops follows, replies, reactions, sends and
// notifications; reports fill in what was reported, can't be read back, and can't be faked.
// Usage (from the repo folder): node scripts/check-reports-blocks.mjs
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

let failed = 0;
const check = (ok, label) => { console.log(`${ok ? "  ok  " : "  FAIL"} ${label}`); if (!ok) failed++; };
const U = (n) => `00000000-0000-0000-0000-00000000000${n}`;
await db.exec(`
  insert into auth.users (id) values ('${U(1)}'), ('${U(2)}'), ('${U(3)}');
  insert into public.profiles (id, handle) values ('${U(1)}', 'ann'), ('${U(2)}', 'bob'), ('${U(3)}', 'cat');
  insert into public.shows (id, title, source) values ('show0001', 'A Show', 'feed');
  insert into public.episodes (id, show_id, title, source) values ('epA00001', 'show0001', 'An Episode', 'feed');
`);
const as = async (user, sql) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${U(user)}', false);`);
  try { return await db.query(sql); } finally { await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false);"); }
};
const err = (user, sql) => as(user, sql).then(() => null, (e) => e);
const count = async (sql) => Number((await db.query(sql)).rows[0].n);

// Ann and Bob follow each other; Bob sends Ann an episode; Bob reviews; Cat reviews.
await as(1, `insert into public.follows (followee_id) values ('${U(2)}')`);
await as(2, `insert into public.follows (followee_id) values ('${U(1)}')`);
await as(1, `insert into public.logs (episode_ref, rating, hook) values ('epA00001', 4, 'Loved it')`);
await as(2, `insert into public.logs (episode_ref, rating, hook) values ('epA00001', 2, 'Meh')`);
await as(3, `insert into public.logs (episode_ref, rating, hook) values ('epA00001', 5, 'Best one')`);
await as(2, `insert into public.recommendations (to_id, episode_ref, note) values ('${U(1)}', 'epA00001', 'try this')`);
await as(2, `insert into public.comments (log_user_id, episode_ref, body) values ('${U(1)}', 'epA00001', 'nope')`);
check((await count(`select count(*) n from public.notifications where user_id = '${U(1)}' and actor_id = '${U(2)}'`)) > 0, "before: Bob's actions notify Ann");

// ---- Ann blocks Bob ----
check(!(await err(1, `insert into public.blocks (blocked_id) values ('${U(2)}')`)), "Ann can block Bob");
check((await count(`select count(*) n from public.follows where '${U(2)}' in (follower_id, followee_id) and '${U(1)}' in (follower_id, followee_id)`)) === 0, "they're unfollowed both ways");
check((await count(`select count(*) n from public.recommendations where from_id = '${U(2)}' and to_id = '${U(1)}'`)) === 0, "Bob's sends to Ann are cleared");
check((await count(`select count(*) n from public.notifications where user_id = '${U(1)}' and actor_id = '${U(2)}'`)) === 0, "Bob's notifications to Ann are cleared");

let e = await err(2, `insert into public.follows (followee_id) values ('${U(1)}')`);
check(e?.code === "HKB01", "Bob can't follow Ann");
e = await err(1, `insert into public.follows (followee_id) values ('${U(2)}')`);
check(e?.code === "HKB01", "Ann can't follow Bob while he's blocked");
e = await err(2, `insert into public.comments (log_user_id, episode_ref, body) values ('${U(1)}', 'epA00001', 'hey')`);
check(e?.code === "HKB01", "Bob can't reply to Ann's review");
e = await err(2, `insert into public.reactions (log_user_id, episode_ref, kind) values ('${U(1)}', 'epA00001', 'agree')`);
check(e?.code === "HKB01", "Bob can't react to Ann's review");
e = await err(2, `insert into public.recommendations (to_id, episode_ref) values ('${U(1)}', 'epA00001')`);
check(e?.code === "HKB01", "Bob can't send Ann an episode");

// Bob replies on Cat's review where Ann is in the conversation: allowed, but Ann isn't notified.
await as(1, `insert into public.comments (log_user_id, episode_ref, body) values ('${U(3)}', 'epA00001', 'agreed')`);
check(!(await err(2, `insert into public.comments (log_user_id, episode_ref, body) values ('${U(3)}', 'epA00001', 'disagree')`)), "Bob can still reply on Cat's review");
check((await count(`select count(*) n from public.notifications where user_id = '${U(1)}' and actor_id = '${U(2)}'`)) === 0, "…and Ann isn't notified about it");
check((await count(`select count(*) n from public.notifications where user_id = '${U(3)}' and actor_id = '${U(2)}'`)) > 0, "Cat still is");

check((await as(1, `select * from public.blocks`)).rows.length === 1, "Ann sees her block");
check((await as(2, `select * from public.blocks`)).rows.length === 0, "Bob can't see that he's blocked");
check(!!(await err(2, `select public.blocked_between('${U(1)}', '${U(2)}')`)), "the app can't ask who blocked whom");
check(!!(await err(2, `delete from public.blocks where blocker_id = '${U(1)}' returning 1`)) || (await count(`select count(*) n from public.blocks`)) === 1, "Bob can't remove Ann's block");

await as(1, `delete from public.blocks where blocked_id = '${U(2)}'`);
check(!(await err(2, `insert into public.follows (followee_id) values ('${U(1)}')`)), "after unblocking, Bob can follow Ann again");

// ---- reports ----
check(!(await err(1, `insert into public.reports (kind, reason, reported_user_id, episode_ref) values ('review', 'spam', '${U(2)}', 'epA00001')`)), "Ann can report Bob's review");
let r = (await db.query(`select * from public.reports order by created_at desc limit 1`)).rows[0];
check(r?.content === "Meh" && r?.reporter_id === U(1) && r?.reported_handle === "bob", "the report keeps the review's words, the reporter and who wrote it");
check(r?.link === "/episode/epA00001?from=bob&talk=1#thread", `with a link (${r?.link})`);

const cid = (await db.query(`select id from public.comments where author_id = '${U(2)}' limit 1`)).rows[0].id;
await as(3, `insert into public.reports (kind, reason, note, comment_id, reported_user_id) values ('reply', 'harassment', 'rude', '${cid}', '${U(3)}')`);
r = (await db.query(`select * from public.reports where kind = 'reply'`)).rows[0];
check(r?.reported_user_id === U(2) && r?.content === "nope", "a reply report is tied to the reply's real author, whatever the app says");

const bid = (await as(2, `insert into public.briefs (title, dek, topic) values ('Bob list', 'stuff', 'x') returning id`)).rows[0].id;
await as(1, `insert into public.reports (kind, reason, brief_id) values ('list', 'other', '${bid}')`);
r = (await db.query(`select * from public.reports where kind = 'list'`)).rows[0];
check(r?.reported_user_id === U(2) && r?.content === "Bob list — stuff" && r?.link === `/lists/b/${bid}`, "a list report keeps the title and link");

await as(1, `insert into public.reports (kind, reason, reported_user_id) values ('profile', 'spam', '${U(2)}')`);
check((await count(`select count(*) n from public.reports where kind = 'profile' and link = '/u/bob'`)) === 1, "a profile report links to the profile");

await as(1, `insert into public.reports (kind, reason, reported_user_id) values ('profile', 'hate', '${U(2)}')`);
check((await count(`select count(*) n from public.reports where kind = 'profile'`)) === 1, "reporting the same thing twice keeps one report, quietly");

e = await err(1, `insert into public.reports (kind, reason, reported_user_id) values ('profile', 'spam', '${U(1)}')`);
check(e?.code === "HKR01", "you can't report yourself");
e = await err(1, `insert into public.reports (kind, reason, comment_id) values ('reply', 'spam', '${U(9)}')`);
check(e?.code === "HKR02", "reporting something that's gone says so");
e = await err(1, `insert into public.reports (kind, reason, reported_user_id, status) values ('profile', 'spam', '${U(3)}', 'done')`);
check(!!e, "the app can't set a report's status");
e = await err(1, `insert into public.reports (kind, reason, reported_user_id, content) values ('profile', 'spam', '${U(3)}', 'fake')`);
check(!!e, "the app can't write the reported words itself");
check(!!(await err(1, `select * from public.reports`)), "nobody can read reports from the app");
check(!!(await err(1, `select * from public.insights_reports`)), "…or the team view");
check(!!(await err(1, `update public.reports set status = 'dismissed'`)), "…or change them");
await db.exec("set role anon");
e = await db.query(`insert into public.reports (kind, reason, reported_user_id) values ('profile', 'spam', '${U(3)}')`).then(() => null, (x) => x);
await db.exec("reset role");
check(!!e, "signed out, you can't report");

check((await db.query(`select * from public.insights_reports`)).rows.length === 4, "the team view lists every report");

console.log(failed ? `\n${failed} check(s) failed.` : "\nAll report and block checks passed.");
process.exit(failed ? 1 : 0);
