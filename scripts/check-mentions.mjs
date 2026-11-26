// Test for @mentions in replies (supabase/migrations/20261126180000_reply_mentions.sql): every migration on an empty
// in-memory database, then: a mention notifies that person once, not the author or yourself, not an email address,
// at most 5 people, and never across a block.
// Usage (from the repo folder): node scripts/check-mentions.mjs
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
const U = (n) => `00000000-0000-0000-0000-0000000000${String(n).padStart(2, "0")}`;
const names = ["ann", "bob", "cat", "dan", "eve", "fay", "gus", "hal", "ivy"];
await db.exec(`
  insert into auth.users (id) values ${names.map((_, i) => `('${U(i + 1)}')`).join(", ")};
  insert into public.profiles (id, handle) values ${names.map((h, i) => `('${U(i + 1)}', '${h}')`).join(", ")};
  insert into public.shows (id, title, source) values ('show0001', 'A Show', 'feed');
  insert into public.episodes (id, show_id, title, source) values ('epA00001', 'show0001', 'An Episode', 'feed');
`);
const as = async (user, sql) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${U(user)}', false);`);
  try { return await db.query(sql); } finally { await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false);"); }
};
const reply = (user, body) => as(user, `insert into public.comments (log_user_id, episode_ref, body) values ('${U(1)}', 'epA00001', '${body.replace(/'/g, "''")}')`);
const notes = async (user, type) => Number((await db.query(`select count(*) n from public.notifications where user_id = '${U(user)}' and type = '${type}'`)).rows[0].n);
const clear = () => db.exec(`delete from public.notifications`);

// Ann reviews. Bob replies mentioning Cat.
await as(1, `insert into public.logs (episode_ref, rating, hook) values ('epA00001', 4, 'Loved it')`);
await reply(2, "@cat you have to hear this");
check((await notes(3, "mention")) === 1, "Cat is told Bob mentioned her");
check((await notes(1, "comment")) === 1 && (await notes(1, "mention")) === 0, "Ann (the author) gets the usual reply notice only");

// Cat answers mentioning Bob: Bob gets one mention, not also "also replied".
await clear();
await reply(3, "ha, thanks @Bob.");
check((await notes(2, "mention")) === 1, "a capital letter and a trailing dot still count (@Bob.)");
check((await notes(2, "reply")) === 0, "…and Bob isn't sent a second 'also replied' notice");

// Not mentions: yourself, email addresses, handles nobody has.
await clear();
await reply(4, "@dan me myself, mail dan@cat.com, and @nobody_here");
check((await notes(4, "mention")) === 0, "mentioning yourself does nothing");
check((await notes(3, "mention")) === 0, "an email address isn't a mention");
check(Number((await db.query(`select count(*) n from public.notifications where type = 'mention'`)).rows[0].n) === 0, "a handle nobody has does nothing");

// At most 5 people per reply; the same person twice counts once.
await clear();
await reply(2, "@cat @cat @dan @eve @fay @gus @hal @ivy");
check(Number((await db.query(`select count(*) n from public.notifications where type = 'mention'`)).rows[0].n) === 5, "at most 5 people per reply");
check((await notes(3, "mention")) === 1, "mentioning someone twice notifies once");

// Blocks: Eve blocks Bob. Bob mentioning Eve doesn't reach her.
await clear();
await as(5, `insert into public.blocks (blocked_id) values ('${U(2)}')`);
await reply(2, "@eve look");
check((await notes(5, "mention")) === 0, "someone you blocked can't reach you with a mention");

let denied = false;
try { await as(2, `select public.mentioned_ids('@cat')`); } catch { denied = true; }
check(denied, "the app can't call mentioned_ids directly");

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log("\nall good");
