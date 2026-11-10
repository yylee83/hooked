# Hooked: guide for anyone (and any Claude) working on this project

@AGENTS.md

**Read `docs/PLAN.md` first**, especially "Where we left off". Erin and YY merged two versions of the app. The plan records the
decisions that replace older notes below (name, invite-only sign-up, data model, migrations,
TypeScript for new code) and the order of work.

## What this is

**Hooked** (hooked-nu.vercel.app) is "Letterboxd for podcasts." People find podcast episodes, log them
(hooked or not hooked, optional 0.5–5 stars, and "What's the hook?", a one-line review), keep a diary
of what they listened to, follow friends, send and discuss episodes, and make **Briefs**: topic
collections that can be cut down to just the parts of each episode where the topic comes up.

The owner is **YY (Youyoung Lee)**. She is not a developer, so explain changes in plain language,
without code jargon. The current focus is the **review/logging experience**. Keep things simple, and
don't add surfaces to Home without asking: she has removed clutter before (the "For you" row moved
off Home).

## How it's built and shipped

- **Next.js 16 (App Router, Turbopack), React 19**, plain JavaScript (no TypeScript), and one
  stylesheet: `app/globals.css`. No CSS framework.
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
| Resend | Weekly digest email (dormant until keys are added) | `lib/digest.js`, `app/api/cron/digest` |

### Environment variables

- `PODCASTINDEX_API_KEY`, `PODCASTINDEX_API_SECRET`: required, server-only
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`: required (the anon key is safe for the browser)
- `SUPABASE_SERVICE_ROLE_KEY`: server-only. Saves trending topics for the 48-hour view (`lib/trends.js`); without it,
  Trending shows only what Google lists right now. Also used by the weekly digest.
- `CRON_SECRET`: protects the scheduled jobs (daily catalog refresh, weekly digest). Vercel sends it automatically.
- `RESEND_API_KEY`, `DIGEST_FROM`: only for the weekly digest (not set yet)
- Test-only overrides, which point external calls at a local mock: `PODCASTINDEX_BASE_URL`, `CHARTS_FEED_URL`,
  `ITUNES_SEARCH_URL`, `ITUNES_LOOKUP_URL`, `SPOTIFY_BASE_URL`, `TRENDS_FEED_URL`, `WIKI_FEED_URL`, and
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
- To apply new migrations to the live database: `supabase db push` (the project must be linked once
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
- **Shows and episodes** (`shows`, `episodes`, our own 8-character ids): every save that mentions an
  episode fills in `episode_ref` / `show_ref` by itself (triggers in `*_refs_on_save.sql`), creating a basic
  entry if needed. `lib/catalog.js` upgrades entries from Podcast Index, and brings in shows Podcast Index lacks from
  their own feed (through Apple) or as Spotify-only entries. See `docs/DATA_MODEL.md`.
- **Our ids are the keys**: logs, Up next, sends, replies, reactions and notifications by `episode_ref`, hooked shows
  by `show_ref`. The Podcast Index numbers (`episode_id`, `feed_id`) are optional; send them when known, and never send
  them as empty (the database keeps the stored one). A log's show is `episodes.show_id`, through
  `episodes!logs_episode_ref_fkey(show_id)`. In the app, compare episodes and shows with `sameEpisode`, `findLog`,
  `inUpNext`, `sameShow` and `findHookedShow` (`lib/store.js`), and build links with `episodeHref` / `showHref` /
  `logHref` (`lib/addresses.js`).
- Tables: `allowed_emails` (the invite list; no app access), `trending_topics` (48 hours of Google Trends; only the server writes), `profiles` (handle, display_name, now_playing, email_digest, interests), `logs`
  (one per user+episode), `hooked_shows` (one per user+show), `list_items` (the **Up next** queue), `follows`,
  `recommendations` (in-app sends), `reactions`, `comments`, `notifications` (filled by triggers),
  `listening_progress` (where you stopped in each episode; private), and `briefs`.
- **Embeds need explicit foreign-key hints**, because several tables point at `profiles`, e.g.
  `profiles!logs_user_id_fkey(...)`, `profiles!comments_author_id_fkey(...)`. A missing hint
  silently breaks reviews on episode pages (this has happened before).
- Code that reads optional columns should still work if a migration hasn't been run yet.

## Where things are

- **Pages** (`app/`): `/` Home (Up next card, Sent to you as slim rows that drop off once queued or logged, friends' activity, Just logged; no Apple chart),
  `/search` (trending topics, Popular on Hooked, For you, Top on Apple Podcasts; also paste-a-link; "Filter:" pills
  All · Episodes · Shows · Friends under the box, and People and Briefs sections in All),
  `/briefs` (a briefs-only search, "Hooked selects" swipe row of built-in briefs, listener briefs in a grid), `/briefs/new` and `/briefs/b/[id]` (+ `/edit`), `/me` My log (tabs: Episodes, Shows,
  Up next, Wrapped), `/me/hooked` (every hooked show), `/episode/[id]`, `/show/[id]`, `/log/[id]` (the log sheet;
  `[id]` is our short id, and Podcast Index numbers redirect to it), `/u/[handle]`,
  `/people`, `/notifications`, `/welcome` (taste picker), `/login`, `/reset-password`.
- **Buttons on episodes** (`components/Social.js`): `LogButton` ("Log it", or your stars / "✓ Logged"), `QueueButton`
  ("+ Up next"), `HookShowButton`. Done states are yellow (`btn--butter`). `SignInButton` (`components/Account.js`)
  sits in page headers when signed out.
- **API routes** (`app/api/`): `resolve` (paste a link), `episode`, `for-you`, `top-episodes`,
  `genres`, `briefs/draft`, `briefs/add`, `og/episode` (share images), `cron/digest`, `unsubscribe`.
- **Client state**: `lib/store.js` (useSyncExternalStore). Saves to Supabase when signed in, and to
  localStorage when signed out (moved into the account on sign-in).
- **Player**: `components/Player.js` (queue/clips, skip −15/+30, speed, drag the playhead,
  auto-advance through Up next). It remembers where you stopped in `lib/progress.js` (this browser) and,
  signed in, syncs that with `listening_progress` (`lib/progress-sync.js`): on opening Hooked or coming back to the
  tab, the player shows what you played last on any device, 5 seconds early. Newest wins, by the time each device
  saved it; something playing is never interrupted.
- **Reactions** (`lib/social.js`, `components/LogThread.js`): small black icons, no bubbles.
  Thumbs up (`agree`) and thumbs down (`disagree`; the two cancel each other out) vote on the review, under it
  (`LogThread`). + (`adding`: wants to listen, and adds the episode to Up next) is `ReviewAdd`, next to the episode
  in lists of reviews (Home, profiles); episode pages leave it out (they have their own "+ Up next"). Older "same", "ooh" and "great" all count as thumbs up.
  `reviewScore()` ranks reviews on episode pages (adding it > thumbs up > replies > thumbs down). If someone
  who tapped + later logs the episode, the review "got them to listen" (that can be worked out from the data).
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
MCP. Never use the live database for tests, and reading it needs Erin's OK.

## Working with YY

- She reviews on the live site from her phone, so say what to tap and where.
- Ask before big product changes, and keep explanations non-technical.
- She likes rough drafts early, to react to.
