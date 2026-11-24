// Test for the banned-words check (supabase/migrations/20261124180000_banned_words.sql): every migration on an empty
// in-memory database, then sample text. Checks whole-word matching, variants, titles that may be quoted, and that
// reviews, replies, send notes and list titles are refused while older text and other changes still save.
// Usage (from the repo folder): node scripts/check-banned-words.mjs
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
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const word = async (txt, ctx = "") => (await db.query(`select public.banned_word_in(${q(txt)}, ${q(ctx)}) as w`)).rows[0].w;

const blocked = [
  ["This was fucking great", "fucking"], ["FUCK yes", "fuck"], ["Fuuuuck.", "fuuuuck"], ["what a shit show", "shit"],
  ["SHIIIIT", "shiiiit"], ["sh1t", "shit"], ["$hit", "shit"], ["b!tch please", "bitch"], ["a55hole", "asshole"], ["fuck yesss", "fuck"],
  ["such bullshit", "bullshit"], ["kick his ass", "ass"], ["you asses", "asses"], ["c0ck", "cock"], ["what a cunt", "cunt"],
  ["motherfuckers", "motherfuckers"], ["\"shit\"", "shit"], ["shit's wild", "shit"], ["(fuck)", "fuck"], ["shit!", "shit"],
  ["retarded take", "retarded"],
];
for (const [t, w] of blocked) check((await word(t)) === w, `blocks ${JSON.stringify(t)} (${w})`);

const fine = [
  "Scunthorpe United", "a classic class act", "I assume you'll assess it", "Dick Cheney and Moby Dick", "fire retardant",
  "Passion project", "cocktail hour with a peacock", "f*** yes", "Top 10 of 2024", "shiitake mushrooms", "Hell of a story, damn",
  "Assassins", "the grass is greener", "harass", "a titmouse", "Sussex", "1st time listener!", "", "     ",
];
for (const t of fine) check((await word(t)) === null, `allows ${JSON.stringify(t)}`);

check((await word("Bitch Sesh never misses", "Ep 12 / Bitch Sesh")) === null, "a word in the show's own title can be quoted");
check((await word("Bitch Sesh is shit", "Ep 12 / Bitch Sesh")) === "shit", "other words still count when quoting a title");

// ---- the tables ----
const U = (n) => `00000000-0000-0000-0000-00000000000${n}`;
await db.exec(`
  insert into auth.users (id) values ('${U(1)}'), ('${U(2)}');
  insert into public.profiles (id, handle) values ('${U(1)}', 'ann'), ('${U(2)}', 'bob');
  insert into public.shows (id, title, source) values ('show0001', 'Bitch Sesh', 'feed');
  insert into public.episodes (id, show_id, title, source) values ('epA00001', 'show0001', 'Fresh Hell', 'feed');
`);
const as = async (user, sql) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${U(user)}', false);`);
  try { return await db.query(sql); } finally { await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false);"); }
};
const err = (user, sql) => as(user, sql).then(() => null, (e) => e);

let e = await err(1, `insert into public.logs (episode_ref, rating, hook) values ('epA00001', 4, 'total shit')`);
check(e?.code === "HKW01" && e?.detail === "shit", `a review with a banned word is refused (${e?.code} ${e?.detail})`);
check(e?.message === 'Please edit out “shit”. Hooked keeps it clean.', `with a calm message: ${e?.message}`);
check(!(await err(1, `insert into public.logs (episode_ref, rating, hook) values ('epA00001', 4, 'Bitch Sesh at its best')`)), "a review quoting the show's name saves");
check(!!(await err(1, `update public.logs set hook = 'bullshit' where user_id = '${U(1)}'`)), "editing a review to add one is refused");

// Older text, written before the check existed, doesn't block other changes.
await db.exec(`alter table public.logs disable trigger words_check; update public.logs set hook = 'old shit' where user_id = '${U(1)}'; alter table public.logs enable trigger words_check;`);
check(!(await err(1, `update public.logs set rating = 5 where user_id = '${U(1)}'`)), "changing the stars on an older review still works");

e = await err(2, `insert into public.comments (log_user_id, episode_ref, body) values ('${U(1)}', 'epA00001', 'what the fuck')`);
check(e?.code === "HKW01", "a reply with a banned word is refused");
check(!(await err(2, `insert into public.comments (log_user_id, episode_ref, body) values ('${U(1)}', 'epA00001', 'So good')`)), "a clean reply saves");

e = await err(1, `insert into public.recommendations (to_id, episode_ref, note) values ('${U(2)}', 'epA00001', 'listen to this shit')`);
check(e?.code === "HKW01", "a send note with a banned word is refused");
check(!(await err(1, `insert into public.recommendations (to_id, episode_ref, note) values ('${U(2)}', 'epA00001', 'you will love it')`)), "a clean send saves");

e = await err(1, `insert into public.briefs (title, topic) values ('Shit I love', 'stuff')`);
check(e?.code === "HKW01", "a list title with a banned word is refused");
e = await err(1, `insert into public.briefs (title, dek, topic) values ('Good stuff', 'all bangers, no bullshit', 'stuff')`);
check(e?.code === "HKW01", "a list description with one is refused");
check(!(await err(1, `insert into public.briefs (title, topic, items) values ('Bitch Sesh favorites', 'comedy', '[{"title":"Ep 1","feedTitle":"Bitch Sesh"}]')`)), "a list can quote the shows in it");

check(!!(await err(1, `select * from public.banned_words`)), "the app can't read the list directly");
check((await as(1, `select public.banned_word_in('shit') as w`)).rows[0].w === "shit", "the app can ask about a piece of text");

console.log(failed ? `\n${failed} check(s) failed.` : "\nAll banned-word checks passed.");
process.exit(failed ? 1 : 0);
