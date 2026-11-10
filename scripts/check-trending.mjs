// Test for public.trending_conversations: every migration on an empty in-memory database, then example activity.
// Usage (from the repo folder): node scripts/check-trending.mjs
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
`);
for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await db.exec(readFileSync(join(dir, f), "utf8"));

const U = (n) => `00000000-0000-0000-0000-00000000000${n}`;
await db.exec(`
  insert into auth.users (id) values ('${U(1)}'), ('${U(2)}'), ('${U(3)}'), ('${U(4)}');
  insert into public.profiles (id, handle) values ('${U(1)}', 'ann'), ('${U(2)}', 'bob'), ('${U(3)}', 'cat'), ('${U(4)}', null);
  insert into public.shows (id, title, source) values
    ('show0001', 'Show One', 'feed'), ('show0002', 'Show Two', 'feed'), ('show0003', 'Show Three', 'feed'),
    ('show0004', 'Show Four', 'feed'), ('show0005', 'Show Five', 'feed');
  insert into public.episodes (id, show_id, title, source) values
    ('epA00001', 'show0001', 'A: busy today', 'feed'),
    ('epB00001', 'show0001', 'B: same show as A, less busy', 'feed'),
    ('epC00001', 'show0002', 'C: one person only', 'feed'),
    ('epD00001', 'show0003', 'D: six days ago', 'feed'),
    ('epE00001', 'show0004', 'E: eight days ago', 'feed'),
    ('epF00001', 'show0005', 'F: sends only', 'feed');
`);
const log = (u, ep, hook, ago = "1 hour", rating = null) =>
  `insert into public.logs (user_id, episode_ref, title, hooked, hook, rating, logged_at) values ('${U(u)}', '${ep}', 'x', true, ${hook ? `'${hook}'` : "null"}, ${rating ?? "null"}, now() - interval '${ago}');`;
const reply = (author, logUser, ep, ago = "1 hour") =>
  `insert into public.comments (log_user_id, episode_ref, author_id, body, created_at) values ('${U(logUser)}', '${ep}', '${U(author)}', 'hi', now() - interval '${ago}');`;
const agree = (who, logUser, ep) => `insert into public.reactions (log_user_id, episode_ref, user_id, kind) values ('${U(logUser)}', '${ep}', '${U(who)}', 'agree');`;
const send = (from, to, ep, ago = "1 hour") =>
  `insert into public.recommendations (from_id, to_id, episode_ref, title, created_at) values ('${U(from)}', '${U(to)}', '${ep}', 'x', now() - interval '${ago}');`;

await db.exec([
  // A: three people today; bob's review has two thumbs up, so it's the top review. Dan (no handle) wrote a longer one.
  log(1, "epA00001", "pretty good"), log(2, "epA00001", "the best thing this week", "2 hours", 4.5), reply(3, 1, "epA00001"),
  agree(1, 2, "epA00001"), agree(3, 2, "epA00001"),
  log(4, "epA00001", "a very long review from someone without a handle, long enough to win on length alone if it counted"),
  // B: two people, but the same show as A.
  log(1, "epB00001", "fine"), reply(2, 1, "epB00001"),
  // C: one person, replying to their own review.
  log(1, "epC00001", "mine"), reply(1, 1, "epC00001"),
  // D: two people, six days ago.
  log(1, "epD00001", "old news", "6 days"), log(2, "epD00001", "still good", "6 days"),
  // E: two people, eight days ago.
  log(1, "epE00001", "too old", "8 days"), log(2, "epE00001", "too old", "8 days"),
  // F: two sends today, no reviews.
  send(1, 3, "epF00001"), send(2, 3, "epF00001"),
].join("\n"));

let failed = 0;
const check = (ok, label) => { console.log(`${ok ? "  ok  " : "  FAIL"} ${label}`); if (!ok) failed++; };

let rows;
try {
  await db.exec("set role anon;");
  rows = (await db.query("select * from public.trending_conversations(3)")).rows;
  await db.exec("reset role;");
} catch (e) {
  console.log(`  FAIL could not call trending_conversations as a signed-out visitor: ${e.message}`);
  process.exit(1);
}
const order = rows.map((r) => r.episode_ref);
console.log("  got:", order.join(", "));
check(JSON.stringify(order) === JSON.stringify(["epA00001", "epF00001", "epD00001"]), "order is A (busy today), F (sends), D (six days ago)");
check(!order.includes("epB00001"), "B left out: one episode per show");
check(!order.includes("epC00001"), "C left out: one person, and replying to your own review doesn't count");
check(!order.includes("epE00001"), "E left out: older than a week");
const a = rows.find((r) => r.episode_ref === "epA00001") || {};
check(a.reviews === 3 && a.replies === 1 && a.sends === 0, `A counts: 3 reviews · 1 reply · 0 sends (got ${a.reviews} · ${a.replies} · ${a.sends})`);
check(a.top_handle === "bob" && a.top_hook === "the best thing this week" && Number(a.top_rating) === 4.5, `A's top review is @bob's (got @${a.top_handle})`);
check(a.title === "A: busy today" && a.show_title === "Show One", "A carries its title and show");
const f = rows.find((r) => r.episode_ref === "epF00001") || {};
check(f.sends === 2 && f.top_handle == null, "F: 2 sends, no top review");
check((await db.query("select count(*)::int n from public.trending_conversations(1)")).rows[0].n === 1, "asking for 1 gives 1");

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
