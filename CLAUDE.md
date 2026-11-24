# Hooked: guide for anyone (and any Claude) working on this project

@AGENTS.md

**Read `docs/PLAN.md` first**, especially "Where we left off". Erin and YY merged two versions of the app. The plan records the
decisions that replace older notes below (name, invite-only sign-up, data model, migrations,
TypeScript for new code) and the order of work.

## What this is

**Hooked** (hookedonpods.com; `hooked-nu.vercel.app` and `www.` forward to it) is "Letterboxd for podcasts." People find podcast episodes, log them
(hooked or not hooked, optional 0.5–5 stars, and "What's the hook?", a one-line review), keep a diary
of what they listened to, follow friends, send and discuss episodes, and make **Briefs**: topic
collections that can be cut down to just the parts of each episode where the topic comes up. **On screen they are called "Lists"** (YY, 2026-11-22); pages live at `/lists/…` (old `/briefs/…` links forward there, `next.config.mjs`), while the code, API routes and database still say briefs.

Hooked is **Erin and YY (Youyoung Lee)**'s project, built together; the repo just lives under YY's GitHub
account. YY is not a developer, so explain changes in plain language, without code jargon. The current focus is the **review/logging experience**. Keep things simple, and
don't add surfaces to Home without asking: she has removed clutter before (the "For you" row moved
off Home).

## How it's built and shipped

- **Next.js 16 (App Router, Turbopack), React 19**, plain JavaScript (no TypeScript), and one
  stylesheet: `app/globals.css`. No CSS framework.
- **The domain** is `hookedonpods.com` (bought on GoDaddy; its DNS points at Vercel: A records for `@`, a CNAME for
  `www`). `NEXT_PUBLIC_SITE_URL` is `https://hookedonpods.com` in Production; Supabase's sign-in Site URL matches it.
- **GitHub → Vercel.** The repo is `yylee83/hooked` (public). Every push to `main` deploys to
  production automatically within about a minute. **Work on a branch** and let Vercel give you a
  preview URL; merge to `main` only when it's ready to go live.
- Vercel is on the **Hobby** plan. Keep the repo **public**: on Hobby, commits from non-owners to a
  private repo are blocked from deploying.
- **Fetching addresses that come from outside** (pasted links, image or transcript URLs from podcast feeds)
  always goes through `safeFetch` in `lib/safe-fetch.js`. It blocks private and internal addresses (on every
  redirect) and caps time, redirects and size. Plain `fetch` is only for fixed, known services.
- **Never put secrets in the code.** They live only in Vercel → Settings → Environment Variables.
  The Podcast Index secret and the Supabase service-role key must stay server-only: never prefix
  them with `NEXT_PUBLIC_`, and never import them into a client component.

## Outside services

| Service | Used for | Where in code |
|---|---|---|
| Podcast Index API | Shows, episodes, search, transcripts (SHA-1 signed requests) | `lib/podcastindex.js` |
| Apple Podcasts search/lookup (free, no key) | Popularity-aware search, matching pasted Apple links | `lib/itunes.js`, `lib/links.js` |
| Apple top-shows chart RSS | "Trending right now" (Home), Top episodes and taste picker | `lib/charts.js` |
| Spotify public pages / oEmbed | Matching pasted Spotify links | `lib/links.js` |
| Google Trends RSS (Wikipedia fallback) | Trending topics bar on Search: the past 48 hours, saved in `trending_topics` | `lib/trends.js` |
| Supabase | Auth (email + password, magic link), Postgres with row-level security | `lib/supabase/*`, `lib/store.js`, `lib/social.js` |
| Resend | Notification emails (follows, replies, sends, thumbs up and +); weekly digest (dormant until `DIGEST_FROM` is added) | `lib/notify-email.js`, `lib/digest.js`, `app/api/cron/*` |

### Environment variables

- `PODCASTINDEX_API_KEY`, `PODCASTINDEX_API_SECRET`: required, server-only
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`: required. Since 2026-11-11 the "anon key" variable holds
  Supabase's **publishable** key (`sb_publishable_…`, safe for the browser); the legacy JWT keys are disabled on both
  projects. `NEXT_PUBLIC_` values are baked in at build time: after changing one, redeploy production and rebuild
  previews.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only, holds the **secret** key (`sb_secret_…`). Never print it, even in a test
  command's output: show a key's prefix at most (the shell is zsh, which doesn't word-split `$var`). Saves trending topics for the 48-hour view (`lib/trends.js`); without it,
  Trending shows only what Google lists right now. Also used by the weekly digest.
- `CRON_SECRET`: protects the scheduled jobs (daily catalog refresh, weekly digest). Vercel sends it automatically.
- `RESEND_API_KEY`: notification emails (and the weekly digest, which also needs `DIGEST_FROM`, not set). `EMAIL_FROM`
  (optional sender, default `Hooked on Pods <hello@hookedonpods.com>`). Only the live site emails real people; previews
  and local runs send only to `EMAIL_TEST_TO`, if set (the test database holds real addresses).
- Test-only overrides, which point external calls at a local mock: `PODCASTINDEX_BASE_URL`, `CHARTS_FEED_URL`,
  `ITUNES_SEARCH_URL`, `ITUNES_LOOKUP_URL`, `APPLE_PODCASTS_URL`, `SPOTIFY_BASE_URL`, `TRENDS_FEED_URL`, `WIKI_FEED_URL`, and
  `SAFE_FETCH_ALLOW_PRIVATE=1` (lets `safeFetch` reach local mocks; never set it on Vercel)

For local development, put the required keys in `.env.local` (it's gitignored), then run `npm install` and `npm run dev`.

## Database (Supabase)

- **Every schema change is a migration**: a new numbered file in `supabase/migrations/`
  (`YYYYMMDDHHMMSS_short_name.sql`). Never edit an existing migration, and never change the database by
  hand or through the SQL Editor. `20261031000000_baseline.sql` is the schema as it was when we started.
- Before pushing, run `npm run db:check`: it applies every migration to an empty in-memory database.
- For migrations that change saved data, also rehearse on a copy of live: export it (`scripts/export-live.sql`, saved
  outside the repo), then `node scripts/rehearse-migrations.mjs <export.json> <last applied migration> <checks.sql>`.
  It loads the copy in memory, applies the newer migrations and runs the checks (see `scripts/checks/`).
- To apply new migrations to the live database: `supabase db push` (Supabase CLI 3.x: `supabase db push --remote`; the project must be linked once
  with `supabase link --project-ref ltdjzjbqhojhtahewgtd`). Merge the PR first, then push, so the live
  code and database change together. Back up before anything that changes or deletes data.
- **Two databases.** The live site uses `hooked` (`ltdjzjbqhojhtahewgtd`). Preview links use `hooked-test`
  (`wxbpizgeauuomagbmwja`), a copy with the same migrations and a copy of the live data (Vercel's
  Supabase settings are split: Production → live, Preview → test). Try new migrations on the test
  database first: link a separate working folder to it (`supabase link --project-ref wxbpizgeauuomagbmwja
  --workdir <folder>`) so the main folder stays linked to live. The test database can be wiped and
  re-copied from live at any time. On previews, sign in with an email link or "Forgot password?"
  (copied accounts have no password).
- **Invite-only sign-up.** Anyone can browse, but only emails in `allowed_emails` can create an
  account. Supabase Auth checks this itself (the `hook_invite_gate` "Before User Created" hook), so it
  covers passwords, email links and Google. **To invite someone:** Supabase → Table Editor →
  `allowed_emails` → Insert row → their email in lower case. Never write email addresses into a
  migration: the repo is public.
- **Invite links (YY, 2026-11-24):** everyone has one link, `/i/<code>` (`app/i/[code]/page.js`), on Find people's
  "Bring your friends" card (`components/InviteCard.js`: phone share menu, else Copy link / Messages / Email). No limit;
  "Make a new link" retires the old one. The code rides along in the sign-up details (`user_metadata.invite`, also kept
  on the device as `hooked:invite`), and `hook_invite_gate` lets it in, adds the email to `allowed_emails` and records
  `invite_uses`; when the new profile is made, they follow whoever sent the link (`follow_inviter`), which notifies that
  person. Migration `20261124180000_invite_links.sql`, test `node scripts/check-invites.mjs`.
- **Sign-in emails** (confirm, sign-in link, reset): our templates in `supabase/templates/` (pasted into each project's
  dashboard) link to `/auth/confirm` (one "Sign in" button that POSTs to `/auth/callback`, so it works on any device and mail
  scanners can't use it up) and carry a code the "Check your email" screen accepts. See `docs/AUTH_EMAILS.md`.
- **Shows and episodes** (`shows`, `episodes`, our own 8-character ids): every save that mentions an
  episode fills in `episode_ref` / `show_ref` by itself (triggers in `*_refs_on_save.sql`), creating a basic
  entry if needed. `lib/catalog.js` upgrades entries from Podcast Index, and brings in shows Podcast Index lacks from
  their own feed (through Apple) or as Spotify-only entries. See `docs/DATA_MODEL.md`.
- **Our ids are the keys**: logs, Up next, sends, replies, reactions and notifications by `episode_ref`, hooked shows
  by `show_ref`, and nothing else: since Stage D (#79) these rows keep no copies of titles, covers or Podcast Index numbers
  (notifications still do: each is a snapshot). Read details through the episode (`episodeOf` / `LOG_EPISODE` / `withEpisode`
  in `lib/log-episode.js`); a save without our id is refused, so get it first (`ensureRefs` / `ourEpisodeId`). A log's show is `episodes.show_id`, through
  `episodes!logs_episode_ref_fkey(show_id)`. In the app, compare episodes and shows with `sameEpisode`, `findLog`,
  `inUpNext`, `sameShow` and `findHookedShow` (`lib/store.js`), and build links with `episodeHref` / `showHref` /
  `logHref` (`lib/addresses.js`).
- Trending functions: `trending_conversations` and `trending_episodes` run with the owner's rights and return totals only (sends and Up next are private).
- Tables: `allowed_emails` (the invite list; no app access), `trending_topics` (48 hours of Google Trends; only the server writes), `profiles` (handle, display_name, now_playing, email_digest, interests), `logs`
  (one per user+episode; `hooked` is optional and no longer asked: **hooked is for shows**, Decision 6), `hooked_shows` (one per user+show), `list_items` (the **Up next** queue), `follows`,
  `recommendations` (in-app sends), `reactions`, `comments`, `notifications` (filled by triggers),
  `listening_progress` (where you stopped in each episode; private), `finished_episodes` (finished in the player, not
  logged yet; private), `briefs` (`draft` ones are seen only by their author; server pages read without a sign-in, so
  they never show drafts), and the team-only history: `listening_sessions` and `search_events` (see below).
- **Embeds need explicit foreign-key hints**, because several tables point at `profiles`, e.g.
  `profiles!logs_user_id_fkey(...)`, `profiles!comments_author_id_fkey(...)`. A missing hint
  silently breaks reviews on episode pages (this has happened before).
- Code that reads optional columns should still work if a migration hasn't been run yet.

## Where things are

- **Pages** (`app/`): `/` Home ("Trending episodes" at the top: a swipe row of the episodes with the most activity in the past 14 days, from the `trending_episodes` database function (logs, replies, sends, thumbs and +, Up next adds; totals only), `components/TrendingEpisodes.js`; then a slim Up next line, New episodes, listening now, the friends feed ("From people you follow" shows 15, then Show more adds 15, up to 60), then Top conversations (renamed from Trending conversations, YY 2026-11-22; up to 15, and past 4 the list scrolls inside a 500px box with a bottom fade; Erin, 2026-11-21; it was at the top from 2026-11-20), built on Erin's `trending_conversations`: a list of reviews and the replies around them, from `trending_conversations` and then recent reviews with the most replies and thumbs; each opens the review's replies on the episode page, `?from=<handle>&talk=1#thread` (`components/FeaturedDiscussions.js`); the Up next line leads back to My log → Up next (`components/UpNextHome.js`); "New episodes from shows you listen to" swipe row of small cards from shows you hooked, rated 4+ stars or played 5+ minutes of (`my_listening`) (`components/NewEpisodes.js`,
  `/api/new-episodes`; signed out or none of those: no row at all (YY, 2026-11-22: it repeated Trending episodes); icon-only `PlayButton` /
  `QueueButton` with `icon`; the last row is remembered on the device (`hooked:new-eps`, with whose it was; cleared on sign-out) and shown at
  once while the fresh one loads; the top of each hooked show's own feed is read too (`feedNewest` in `lib/catalog.js`, kept 10 minutes), so an episode shows up before Podcast Index lists it: it's saved as one of ours, Podcast Index is asked to re-read the feed (`pubNotify`), and its number later joins the same entry by the feed's episode id), "Listening on Hooked now" for signed-out visitors and in place of an empty "Friends
  listening now" (`components/ListeningOnHooked.js`, `/api/listening-now`: episodes and counts only, never names),
  Sent to you as slim rows that drop off once queued or logged (one row per episode: everyone who sent it and each different note; × dismisses them all), "Friends listening now" (played in the last day), friends' activity ("From people you follow"); no Just logged (removed 2026-11-21) and no Apple chart),
  `/search` (trending topics, Popular on Hooked, For you, Top on Apple Podcasts; also paste-a-link; "Filter:" pills
  All · Episodes · Shows · Friends under the box, and People and Briefs sections in All),
  `/lists` (a briefs-only search, "Featured briefs" swipe row of built-in briefs in pink, listener briefs in a blue grid), `/lists/new` (new briefs use whole episodes for now; the "Just the parts" choice comes back later) and `/lists/b/[id]` (+ `/edit`; signed in, the builder saves a draft as you go, and a draft's edit page loads it in
  the browser, `components/DraftEditor.js`), `/me` My log (the big blue Up next card above the tabs, where "Listening now" used to be: first episode with a play button, the next few covers, "See all" opens the Up next tab, `components/UpNextCard.js`; tabs: Episodes, Shows,
  Up next (topped by "Keep listening": episodes started and not finished, from your saved spots, `components/KeepListening.js`; never episodes you've logged), Wrapped), `/me/hooked` (every hooked show), `/episode/[id]`, `/show/[id]`, `/log/[id]` (the log sheet: "+ Hook this show" under the
  show name (`HookShowPill`, saves straight away), Your rating, What did you think?; no per-episode hooked question; `[id]` is our short id, and Podcast Index numbers redirect to it), `/u/[handle]`,
  `/people`, `/notifications`, `/welcome` (taste picker), `/login`, `/reset-password`, `/privacy` and `/terms` (a starting
  draft, 2026-11-24, for a lawyer to review; linked from sign-up, the My log gear and the history note: **when the app
  starts collecting or sharing something new, update `/privacy` and its date in the same change**).
- **Sign-up and the steps after it (YY, 2026-11-23):** the form asks for email, handle, an optional Name and a required "I'm 13
  or older" tick box (kept in the account's sign-up details as `over_13`). Then three skippable steps: `/welcome/shows`
  (pick favorite shows: saved as hooked shows; search through `/api/shows`, `components/FavoriteShows.js`) →
  `/welcome/people` (Follow a few people) → `/welcome/about` (how you heard about Hooked; city picked from suggestions as you type, `/api/places` over
  `lib/places-data.json`, built by `scripts/make-places.mjs` from GeoNames, CC BY 4.0;
  `components/QuickQuestions.js`) → Home. Answers are private, in `signup_answers` (own row only; the team reads it in Supabase).
- **Buttons on episodes** (`components/Social.js`): `LogButton` ("Log it", or your stars / "✓ Logged"), `QueueButton`
  ("+ Up next"), `HookShowButton`; on episode pages also `AddToBriefButton` ("+ Brief", `components/AddToBrief.js`: add to one
  of your briefs or start a draft; helpers in `lib/briefs-client.js`). Done states are yellow (`btn--butter`). `SignInButton` (`components/Account.js`)
  sits in page headers when signed out.
- **API routes** (`app/api/`): `resolve` (paste a link), `episode`, `for-you`, `top-episodes`,
  `genres`, `new-episodes`, `listening-now`, `briefs/draft`, `briefs/add`, `og/episode` (share images), `cron/digest`, `unsubscribe`.
- **Client state**: `lib/store.js` (useSyncExternalStore). Saves to Supabase. **Logging, Up next and hooking a show
  need an account** (Erin, 2026-11-21): signed out, those buttons open sign-in and come back (`useSignInFirst` /
  `signInHref` in `lib/sign-in-first.js`; the log page redirects), the player doesn't ask "Log it?", and the store
  refuses the save (`needsAccount`). Signed out, people browse and listen. Anything saved in a browser before that is
  still moved into the account on sign-in.
- **Player**: `components/Player.js` (queue/clips, skip −15/+30 (the lock screen skips 10 each way, to match the "10" its buttons show), speed, drag the playhead,
  auto-advance through Up next; an episode on Up next comes off it as soon as it starts playing, from anywhere, and
  finishing any episode (not a brief) starts the next one on Up next; the next one is looked up two minutes before the
  end, so it starts at once on a locked phone). It remembers where you stopped in `lib/progress.js` (this browser) and,
  signed in, syncs that with `listening_progress` (`lib/progress-sync.js`): on opening Hooked or coming back to the
  tab, the player shows what you played last on any device, 5 seconds early. Newest wins, by the time each device
  saved it; something playing is never interrupted. An episode started with only Podcast Index's number gets our id
  as soon as it plays (`addRef`); `ensureRefs` (`lib/catalog-client.js`) remembers answers, so it's asked once per visit. A resumed episode shows the length measured from its audio
  (`savedLength`), not the feed's. Its X doesn't close it: it tucks the player into a small tab in the bottom-left corner (cover with bouncing sound
  bars while playing, a caret), which opens it again; it keeps playing, stays tucked across pages and reloads (`hooked:player-min`), and
  opens back up when you press Play on something (Up next moving on by itself doesn't). A **Log it** pill sits at the bottom right (yellow "Logged" once logged); logging
  doesn't stop playback. The bottom bar stays pinned on iPhone after the keyboard closes (`useBottomPinned`,
  `components/BottomNav.js`).
- **"Log it?" after listening** (`lib/finished.js`): the last minute of an episode (not a brief's clip) counts as
  finished. If you're looking, the player turns into "✓ Finished · log it?" (`components/FinishPrompt.js`: optional stars,
  a small **Hook show** pill, then **Log it**; it stays ("Saving…") until saved, then shows "✓ Logged" briefly); ✕, or finishing with the screen off, puts it under "Finished, not logged" at the top of My log's
  Episodes tab (`components/FinishedNotLogged.js`) for 3 days, where Skip ends it. Logged episodes are never asked about.
  Signed in, the list syncs across devices through `finished_episodes` (`lib/finished-sync.js`; private, own rows only).
- **Hooked is for shows, stars rate episodes** (Decision 6): no screen reads a log's `hooked`. Feeds say "rated" / "logged"
  (`logVerb`), averages come from `starStats` (`lib/format.js`), and % hooked counts hooked shows among a show's listeners.
- **Reactions** (`lib/social.js`, `components/LogThread.js`): small black icons, no bubbles.
  Thumbs up (`agree`) and thumbs down (`disagree`; the two cancel each other out) vote on the review, under it
  (`LogThread`). + (`adding`: wants to listen, and adds the episode to Up next) is `ReviewAdd`, next to the episode
  in lists of reviews (Home, profiles); episode pages leave it out (they have their own "+ Up next"). Older "same", "ooh" and "great" all count as thumbs up.
  `reviewScore()` ranks reviews on episode pages (adding it > thumbs up > replies > thumbs down). If someone
  who tapped + later logs the episode, the review "got them to listen" (that can be worked out from the data).
- **Listening and search history (team only)**: `lib/history.js` records each play in the player (where it started from,
  how far, skips, finished) and each search with the first result tapped (`components/SearchRecorder.js`, results inside
  `[data-search-results]`). Signed-in people only, written through `record_listen` / `record_search` / `record_search_tap`;
  the app can't read any of it back, except each person's own totals through `my_listening` (`lib/my-listening.js`), which lead Wrapped and the "hrs listened" on My log (YY, 2026-11-20: stats come from real listening, logs underneath; before 10 minutes played, Wrapped falls back to logs). Erin and YY read the `insights_*` views in Supabase (finish rate, drop-off, listening
  trend, top searches, search misses, brief ideas). Kept a year (`prune_history`, daily job). Notice: `components/HistoryNote.js`.
  Matching between people uses public logs only. New functions: revoke from `anon, authenticated` too, not just `public`
  (Supabase grants them by default; `scripts/check-history.mjs` mimics that).
- **Shares (team only, 2026-11-22)**: each tap on "Share anywhere" for an episode or brief (share menu, Copy link, Messages,
  Email, WhatsApp, X; a closed share menu doesn't count) is saved in `share_events` through `record_share` (`recordShare` in
  `lib/history.js`, called from `components/Share.js`); in-app sends are `recommendations`. Same rules as history: signed in
  only, never read back, kept a year. Views: `insights_shares_daily`, `insights_shares_top` (inside and outside together).
  Both trending functions count an outside share of an episode as sharing, like a send. Test: `node scripts/check-shares.mjs`.
- **Unread notifications (YY, 2026-11-22)**: a pink count on the bell (YY first asked for red, then kept pink) (Home, My log) and on the My log tab in the bottom bar,
  from one shared count (`lib/unread.js`, asked on opening, signing in, changing pages, coming back to the tab and every
  minute). On opening Hooked with something new, a small note at the top ("@ana followed you and 2 more",
  `NotificationToast` in `components/Notifications.js`) shows once per notification (`hooked:note-toast`). Opening
  /notifications marks them read and clears the counts. Follows, sends, replies and reactions all create notifications.
- **Notification emails (YY, 2026-11-24)**: `lib/notify-email.js`. Follows, replies, sends, thumbs up and + (not
  thumbs down) are emailed, at most one email an hour per person, bundled; never something already read, nothing older
  than 3 days. The app pings `/api/notify-email` right after the action (`lib/notify-ping.js`), and a daily catch-up
  (`/api/cron/notify-email`, 14:00 UTC; Hobby crons run once a day) sends what was held back. Switch: `profiles.email_notify`
  (My log gear; email footer link `/api/unsubscribe?k=notify`). `notifications.emailed_at`, `notify_emails` (last sent;
  server only). Test: `node scripts/check-notify-emails.mjs`.
- **Clean language (YY, 2026-11-24)**: reviews, replies, send notes, list titles/descriptions/topics, handles and display names can't be saved
  with a word from the `banned_words` table: the database refuses it (`words_check` triggers, code `HKW01`), and the app
  shows "Please edit out “…”. Hooked keeps it clean." (`lib/clean-words.js`). Whole words only, plus stretched letters
  and simple swaps ($ → s, 1 → i); a word in the episode's or show's own title may be quoted ("Bitch Sesh"); only new or
  changed text is checked. **To add or remove a word:** Supabase → Table Editor → `banned_words` (lower case; end with `*`
  to also block longer words starting with it). Handles and names also block `inside_names` words anywhere inside
  ("shittalker"; `banned_name_in`, asked by the sign-up form too). Test: `node scripts/check-banned-words.mjs`.
- **Back buttons** (Erin, 2026-11-24): every "← Back" (show, episode, list, list editor, hooked shows) and the log
  sheet's Cancel go back to the screen you were on (`components/BackButton.js`: `BackButton`, `useGoBack`). With no
  earlier Hooked screen in the tab (a shared link, a new tab), they go to a fixed page instead (a show's goes to Search, an
  episode's to its show). The trail of screens is kept by `BackTracker` in the root layout (`hooked:trail` in
  sessionStorage), because Next.js rewrites the browser's own history entries. New back links should use `BackButton`.
- **Search and Briefs search boxes** use `next/form`, so searching changes the page without reloading the site and the player keeps playing. Any new form that changes pages should do the same.
- **Plain /search and /lists are made ahead of time** (`app/search/page.js`, kept 30 minutes; `app/lists/page.js`, 10
  minutes), so the bottom-bar tabs open fully loaded. Searches and filters live at `/search/find?q=…` and
  `/lists/find?q=…`: **link and submit forms there directly**. Inside the app, a link to `/search?q=…` reuses the
  ready-made page and shows no results (broke live 2026-11-21 to 22); `next.config.mjs` only keeps old `/search?q=…`
  links working when opened from outside. Their shared lists are in
  `components/SearchSections.js`.
- **Search ranking**: `lib/rank.js`. A result must contain the phrase, or all the words close
  together. Exact show names are boosted (the part before ":" or "|" counts as the name), and so are Apple popularity
  and recency; other languages rank lower. Show nothing rather than unrelated results. Shows only Apple knows:
  `lib/search.js`. Friends filter: `components/FriendsResults.js`. People and Briefs: `lib/search-community.js`.
  Podcast Index answers are cached by the question in `call()` (`lib/podcastindex.js`): the signed request headers
  would otherwise make every request look new.

## Design rules

- Brand: cobalt `#2340FF`, bubblegum `#FF7AC6`, butter `#FFE14D`, ink `#15131D`, cream `#FFF7EE`.
  Fonts: **Bagel Fat One** (display), **Geist** (body), **Geist Mono** (labels). Use the CSS
  variables in `globals.css` (`--display`, `--mono`, `--muted`, `--line`, etc.).
- Sticker look: 3px ink outlines, hard offset shadows (`4px 4px 0 var(--ink)`), rounded corners,
  slight tilts on cover art. The wordmark is "hooked on" with a pink/yellow playhead bar.
- **One stylesheet for everything, so class names must be unique.** Before adding a class, check it isn't already used
  (`grep -rn "classname" app components`), and prefix new ones with their component (`.search-filters`, `.brief-card`).
  A reused name broke My log's filters and, live, the brief chips on profiles (fixed in #49).
- Mobile first: test at 390px wide. The bottom nav covers about 90px, so leave room.
- Copy is short, warm and plain: no jargon, no exclamation-heavy hype.

## Testing

Before pushing, run `npm run lint`, `npm run db:check` and `npm run build`. GitHub runs the same three on every
pull request (`.github/workflows/check.yml`); a red check means don't merge yet.

External services may not be reachable from a sandbox. Two approaches have worked: (1) small local mocks of Podcast
Index, Apple and Spotify, plus a fake Supabase REST/auth server, with the override env vars pointed at them; (2) a
local build against the **test** database (see "Testing notes" in `docs/PLAN.md`: build-time keys, throwaway accounts,
cleaning up). For a test database full of friends, logs, replies and sends, run `scripts/seed-test-people.mjs` (test
database only; `--remove` cleans up). Drive the site with Playwright at 390×844, check pages for console errors, and screenshot anything
visual. Images load lazily: wait before screenshots. After pushing, confirm the Vercel status:
`gh api repos/yylee83/hooked/commits/<sha>/status`; previews are behind Vercel's login, so fetch them with the Vercel
MCP. Never use the live database for tests, and reading it needs Erin's OK. For local runs against the test database, pass its URL and
publishable key as env overrides (`.env.local` points at live); see "Testing notes" in `docs/PLAN.md`.

## Working with YY

- She reviews on the live site from her phone, so say what to tap and where.
- Ask before big product changes, and keep explanations non-technical.
- She likes rough drafts early, to react to.
