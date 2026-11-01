# Hooked: guide for anyone (and any Claude) working on this project

@AGENTS.md

**Read `docs/PLAN.md` first.** Erin and YY merged two versions of the app. The plan records the
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
- `RESEND_API_KEY`, `DIGEST_FROM`, `CRON_SECRET`: only for the weekly digest (not set yet)
- Test-only overrides, which point external calls at a local mock: `PODCASTINDEX_BASE_URL`, `CHARTS_FEED_URL`,
  `ITUNES_SEARCH_URL`, `ITUNES_LOOKUP_URL`, `SPOTIFY_BASE_URL`, `TRENDS_FEED_URL`, `WIKI_FEED_URL`

For local development, put the required keys in `.env.local` (it's gitignored), then run `npm install` and `npm run dev`.

## Database (Supabase)

- **Every schema change is a migration**: a new numbered file in `supabase/migrations/`
  (`YYYYMMDDHHMMSS_short_name.sql`). Never edit an existing migration, and never change the database by
  hand or through the SQL Editor. `20261031000000_baseline.sql` is the schema as it was when we started.
- Before pushing, run `npm run db:check`: it applies every migration to an empty in-memory database.
- To apply new migrations to the live database: `supabase db push` (the project must be linked once
  with `supabase link --project-ref ltdjzjbqhojhtahewgtd`). Merge the PR first, then push, so the live
  code and database change together. Back up before anything that changes or deletes data.
- **Invite-only sign-up.** Anyone can browse, but only emails in `allowed_emails` can create an
  account. Supabase Auth checks this itself (the `hook_invite_gate` "Before User Created" hook), so it
  covers passwords, email links and Google. **To invite someone:** Supabase → Table Editor →
  `allowed_emails` → Insert row → their email in lower case. Never write email addresses into a
  migration: the repo is public.
- Tables: `allowed_emails` (the invite list; no app access), `trending_topics` (48 hours of Google Trends; only the server writes), `profiles` (handle, display_name, now_playing, email_digest, interests), `logs`
  (one per user+episode), `hooked_shows`, `list_items` (the **Up next** queue), `follows`,
  `recommendations` (in-app sends), `reactions`, `comments`, `notifications` (filled by triggers),
  and `briefs`.
- **Embeds need explicit foreign-key hints**, because several tables point at `profiles`, e.g.
  `profiles!logs_user_id_fkey(...)`, `profiles!comments_author_id_fkey(...)`. A missing hint
  silently breaks reviews on episode pages (this has happened before).
- Code that reads optional columns should still work if a migration hasn't been run yet.

## Where things are

- **Pages** (`app/`): `/` Home (Up next card, friends' activity, Just logged, Apple top chart),
  `/search` (trending topics, Popular on Hooked on, For you, Top episodes; also paste-a-link),
  `/briefs`, `/briefs/new` and `/briefs/b/[id]` (+ `/edit`), `/me` My log (tabs: Diary, Shows,
  Up next, Wrapped), `/episode/[id]`, `/show/[id]`, `/log/[id]` (the log sheet), `/u/[handle]`,
  `/people`, `/notifications`, `/welcome` (taste picker), `/login`, `/reset-password`.
- **API routes** (`app/api/`): `resolve` (paste a link), `episode`, `for-you`, `top-episodes`,
  `genres`, `briefs/draft`, `briefs/add`, `og/episode` (share images), `cron/digest`, `unsubscribe`.
- **Client state**: `lib/store.js` (useSyncExternalStore). Saves to Supabase when signed in, and to
  localStorage when signed out (moved into the account on sign-in).
- **Player**: `components/Player.js` (queue/clips, skip −15/+30, speed, drag the playhead,
  auto-advance through Up next).
- **Reactions** (`lib/social.js`, `components/LogThread.js`): small black icons, no bubbles.
  Thumbs up (`agree`), thumbs down (`disagree`; the two cancel each other out), and + (`adding`: wants to
  listen, and adds the episode to Up next). Older "same", "ooh" and "great" all count as thumbs up.
  `reviewScore()` ranks reviews on episode pages (adding it > thumbs up > replies > thumbs down). If someone
  who tapped + later logs the episode, the review "got them to listen" (that can be worked out from the data).
- **Search ranking**: `lib/rank.js`. A result must contain the phrase, or all the words close
  together. Exact show names are boosted, and so are Apple popularity and recency. Show nothing
  rather than unrelated results.

## Design rules

- Brand: cobalt `#2340FF`, bubblegum `#FF7AC6`, butter `#FFE14D`, ink `#15131D`, cream `#FFF7EE`.
  Fonts: **Bagel Fat One** (display), **Geist** (body), **Geist Mono** (labels). Use the CSS
  variables in `globals.css` (`--display`, `--mono`, `--muted`, `--line`, etc.).
- Sticker look: 3px ink outlines, hard offset shadows (`4px 4px 0 var(--ink)`), rounded corners,
  slight tilts on cover art. The wordmark is "hooked on" with a pink/yellow playhead bar.
- Mobile first: test at 390px wide. The bottom nav covers about 90px, so leave room.
- Copy is short, warm and plain: no jargon, no exclamation-heavy hype.

## Testing

Before pushing, run `npm run lint`, `npm run db:check` and `npm run build`. GitHub runs the same three on every
pull request (`.github/workflows/check.yml`); a red check means don't merge yet.

External services may not be reachable from a sandbox. The approach that has worked: run small
local mocks of Podcast Index, Apple and Spotify, plus a fake Supabase REST/auth server, point the
override env vars at them, and drive the site with Playwright at 390×844. Check pages for console
errors, and screenshot anything visual. After pushing, confirm the Vercel status:
`gh api repos/yylee83/hooked/commits/<sha>/status`.

## Working with YY

- She reviews on the live site from her phone, so say what to tap and where.
- Ask before big product changes, and keep explanations non-technical.
- She likes rough drafts early, to react to.
