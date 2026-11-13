// Test people for the TEST database (hooked-test), so preview links have friends, logs, replies and sends to
// look at. Never runs against the live database. Re-run it after refreshing the test database from live
// (a refresh wipes these accounts).
//
// Usage (from the repo folder):
//   TEST_PEOPLE_PASSWORD='pick-one' node scripts/seed-test-people.mjs                    make (or remake) them
//   TEST_PEOPLE_PASSWORD='pick-one' node scripts/seed-test-people.mjs --friends-with erin  …and make them friends with @erin
//   node scripts/seed-test-people.mjs --remove                                            delete them all
//
// Sign in as one on a preview with its email (listed when it finishes) and that password.
// Key: the test project's **secret** key (sb_secret_…) in SUPABASE_SERVICE_ROLE_KEY. Copy it from Supabase → hooked-test
// → Project Settings → API Keys, then load it without it showing on screen or landing in your shell history (zsh):
//   read -rs "SUPABASE_SERVICE_ROLE_KEY?Test secret key: " && export SUPABASE_SERVICE_ROLE_KEY
// (The Supabase CLI hides secret keys, and the old service_role keys were turned off on 2026-11-11.)
// Their emails are made up (@example.com): never put real addresses in this file, the repo is public.
import { createClient } from "@supabase/supabase-js";

const TEST_REF = "wxbpizgeauuomagbmwja";
const URL = `https://${TEST_REF}.supabase.co`;
const args = process.argv.slice(2);
const remove = args.includes("--remove");
const friendsWith = (args[args.indexOf("--friends-with") + 1] || "").replace(/^@/, "");
const wantFriends = args.includes("--friends-with");

const PEOPLE = [
  { handle: "maya.test", name: "Maya · test", email: "maya.test@example.com" },
  { handle: "sam.test", name: "Sam · test", email: "sam.test@example.com" },
  { handle: "jo.test", name: "Jo · test", email: "jo.test@example.com" },
  { handle: "priya.test", name: "Priya · test", email: "priya.test@example.com" },
  { handle: "theo.test", name: "Theo · test", email: "theo.test@example.com" },
];

// Hook lines and replies that read naturally whatever the episode is.
const HOOKS_YES = [
  "Couldn't stop thinking about this one all day",
  "The guest is a delight, I laughed out loud on the train",
  "Best episode they've done in months",
  "Sent this to my sister straight away",
  "Changed my mind about the whole thing",
  "Perfect for a long walk",
];
const HOOKS_NO = ["Great first half, then it drags", "Too much ad chat for me", "Interesting topic, but the hosts talk over each other"];
const REPLIES = ["Agree, that ending!", "I need to listen to this", "Hard disagree, I loved the second half", "Adding it to Up next", "Which part got you?"];

function serviceKey() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!key.startsWith("sb_secret_")) {
    console.error(
      "Set SUPABASE_SERVICE_ROLE_KEY to the test project's secret key (sb_secret_…), from Supabase → hooked-test →\n" +
        "Project Settings → API Keys. Without it showing on screen (zsh):\n" +
        '  read -rs "SUPABASE_SERVICE_ROLE_KEY?Test secret key: " && export SUPABASE_SERVICE_ROLE_KEY'
    );
    process.exit(1);
  }
  return key;
}

const db = createClient(URL, serviceKey(), { auth: { persistSession: false, autoRefreshToken: false } });
const must = ({ data, error }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
};

// Saves with the old copied columns (title, feed_title…) if the database still requires them; they go in
// stage D, so try without first.
async function insertFlexible(table, rows, copies) {
  if (!rows.length) return;
  let res = await db.from(table).insert(rows);
  if (res.error && /null value in column|violates not-null/i.test(res.error.message)) res = await db.from(table).insert(rows.map((r, i) => ({ ...r, ...copies(i) })));
  must(res, `saving ${table}`);
}

async function findUser(email) {
  for (let page = 1; page < 50; page++) {
    const { users } = must(await db.auth.admin.listUsers({ page, perPage: 200 }), "listing users");
    const u = users.find((x) => x.email === email);
    if (u || users.length < 200) return u || null;
  }
  return null;
}

async function removeAll() {
  for (const p of PEOPLE) {
    const u = await findUser(p.email);
    if (u) must(await db.auth.admin.deleteUser(u.id), `deleting ${p.handle}`); // their logs, follows, replies… go with them
    must(await db.from("allowed_emails").delete().eq("email", p.email), "removing invite");
  }
  console.log(`Removed ${PEOPLE.length} test people.`);
}

async function create(password) {
  await removeAll();
  const ids = {};
  for (const p of PEOPLE) {
    must(await db.from("allowed_emails").upsert({ email: p.email }, { onConflict: "email", ignoreDuplicates: true }), "inviting");
    const { user } = must(await db.auth.admin.createUser({ email: p.email, password, email_confirm: true }), `creating ${p.handle}`);
    must(await db.from("profiles").upsert({ id: user.id, handle: p.handle, display_name: p.name }), `profile for ${p.handle}`);
    ids[p.handle] = user.id;
  }
  const handles = PEOPLE.map((p) => p.handle);

  // Everyone follows everyone except Theo, who only follows Maya (so feeds differ a little).
  const follows = [];
  for (const a of handles) for (const b of handles) if (a !== b && (a !== "theo.test" || b === "maya.test")) follows.push({ follower_id: ids[a], followee_id: ids[b] });
  let friend = null;
  if (wantFriends) {
    friend = must(await db.from("profiles").select("id, handle").eq("handle", friendsWith).maybeSingle(), "finding your account");
    if (!friend) throw new Error(`No @${friendsWith} on the test database.`);
    for (const h of handles) follows.push({ follower_id: friend.id, followee_id: ids[h] }, { follower_id: ids[h], followee_id: friend.id });
  }
  must(await db.from("follows").upsert(follows, { onConflict: "follower_id,followee_id", ignoreDuplicates: true }), "follows");

  // Recent episodes that can play, from a spread of shows.
  const eps = must(
    await db.from("episodes").select("id, podcastindex_id, title, image_url, audio_url, duration_seconds, show:shows!inner(id, podcastindex_id, title, image_url)").not("audio_url", "is", null).order("published_at", { ascending: false, nullsFirst: false }).limit(300),
    "reading episodes"
  );
  const byShow = new Map();
  for (const e of eps) if (!byShow.has(e.show.id)) byShow.set(e.show.id, e);
  const pool = [...byShow.values()].slice(0, 14);
  if (pool.length < 6) throw new Error("The test database has too few episodes with audio to log.");

  // Each person logs 4–6 episodes over the last 10 days; the first few episodes are shared, so some are
  // "talked about" by several people.
  const now = Date.now();
  const logs = [];
  handles.forEach((h, pi) => {
    const mine = [pool[0], pool[1 + (pi % 3)], ...pool.slice(4 + pi * 2, 7 + pi * 2)].filter(Boolean);
    mine.forEach((e, k) => {
      const hooked = (pi + k) % 4 !== 3;
      logs.push({
        user_id: ids[h],
        episode_ref: e.id,
        hooked,
        rating: hooked ? [5, 4.5, 4, 3.5][(pi + k) % 4] : [2.5, 3][(pi + k) % 2],
        hook: hooked ? HOOKS_YES[(pi * 2 + k) % HOOKS_YES.length] : HOOKS_NO[(pi + k) % HOOKS_NO.length],
        logged_at: new Date(now - ((pi * 37 + k * 53) % 240) * 3600 * 1000).toISOString(),
        _ep: e,
      });
    });
  });
  const ep = (r) => r._ep;
  const logCopies = (rows) => (i) => {
    const e = ep(rows[i]);
    return { episode_id: e.podcastindex_id, title: e.title, feed_id: e.show.podcastindex_id, feed_title: e.show.title, image: e.image_url || e.show.image_url, feed_image: e.show.image_url, audio: e.audio_url, duration: e.duration_seconds };
  };
  await insertFlexible("logs", logs.map(({ _ep, ...r }) => r), logCopies(logs));

  // Votes and replies on each other's reviews (mostly on the shared episodes).
  const reactions = [];
  const comments = [];
  logs.forEach((l, i) => {
    for (const [j, h] of handles.entries()) {
      if (ids[h] === l.user_id || (i + j) % 3 !== 0) continue;
      reactions.push({ log_user_id: l.user_id, episode_ref: l.episode_ref, user_id: ids[h], kind: (i + j) % 5 === 0 ? "disagree" : "agree" });
      if ((i + j) % 4 === 0) comments.push({ log_user_id: l.user_id, episode_ref: l.episode_ref, author_id: ids[h], body: REPLIES[(i + j) % REPLIES.length] });
    }
  });
  must(await db.from("reactions").insert(reactions), "votes");
  must(await db.from("comments").insert(comments), "replies");

  // Sends: to you if --friends-with, and a couple between test people.
  const sends = [];
  const send = (from, to, e, note) => sends.push({ from_id: from, to_id: to, episode_ref: e.id, note, _ep: e });
  if (friend) handles.slice(0, 4).forEach((h, k) => send(ids[h], friend.id, pool[(k * 3 + 2) % pool.length], ["You'll love this", "Thought of you", "The bit about halfway through!", ""][k]));
  send(ids["maya.test"], ids["sam.test"], pool[5], "For your commute");
  send(ids["jo.test"], ids["priya.test"], pool[2], "");
  await insertFlexible(
    "recommendations",
    sends.map(({ _ep, ...r }) => r),
    (i) => {
      const e = sends[i]._ep;
      return { episode_id: e.podcastindex_id, title: e.title, feed_id: e.show.podcastindex_id, feed_title: e.show.title, image: e.image_url || e.show.image_url, audio: e.audio_url, duration: e.duration_seconds };
    }
  );

  console.log(`Made ${PEOPLE.length} test people: ${logs.length} logs, ${reactions.length} votes, ${comments.length} replies, ${sends.length} sends.`);
  if (friend) console.log(`They and @${friend.handle} follow each other; ${sends.length - 2} episodes are in @${friend.handle}'s Sent to you.`);
  console.log("Sign in on a preview with any of these emails and your TEST_PEOPLE_PASSWORD:");
  for (const p of PEOPLE) console.log(`  ${p.email}  (@${p.handle})`);
}

if (remove) await removeAll();
else {
  const password = process.env.TEST_PEOPLE_PASSWORD || "";
  if (password.length < 8) throw new Error("Set TEST_PEOPLE_PASSWORD (8+ characters): the password they'll all share.");
  await create(password);
}
