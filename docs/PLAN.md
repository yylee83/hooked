# Hooked: merge decisions and plan

Erin and YY built two versions of Hooked in parallel. This repo (YY's) is the shared base. This file records what we decided and the order we're doing the work in. Update it when a decision changes.

## Where we left off (2026-11-07)

**Start Claude Code in `~/claude/hooked-shared`** (`cd ~/claude/hooked-shared && claude`). `~/claude/hooked` is Erin's
archived first version: don't build from it.

**Latest session (2026-11-07): tidying Home and Search.** The aim, agreed by Erin: **Home shows what's happening on
Hooked** (like Instagram's main feed; Friends | Everyone later) and **Search helps you discover something and log it**
(like a discover page). Home and Search overlapped: Apple's chart was on both, "Trending" meant two things, and a friend's
log appeared twice on Home ("From people you follow" and "Just logged").
- **Live (PR #26):** "Sent to you" is slim rows (two, then "Show all"; + adds to Up next, × is "not for me"), above
  Listening now. **A send drops off once the episode is in your Up next or you've logged it** (filtered in
  `FriendsFeed` with `inUpNext` / `findLog`; nothing deleted, so it comes back if you remove it from Up next unlogged).
  **The + (`adding` reaction) moved out of the thumbs row** to `ReviewAdd` (`components/LogThread.js`), next to the
  episode in lists of reviews (Home, profiles). Episode pages leave it out (they have their own "+ Up next"). Apple's
  top shows left Home and joined the top episodes on Search as **"Top on Apple Podcasts"**.
- **Open (PR #27):** covers (`components/Art.js`) no longer crash on a null title. A log with no show name took down
  Search through "Popular on Hooked". Erin merges it.
- **Decisions for Erin and YY, in a doc:** [Hooked: Home and Search decisions](https://claude.ai/artifact/CLGuhPA7uZ96u7NESmvXKZ)
  (Claude Docs; it has a checklist). Don't build these until they've decided:
  1. **One feed with a Friends | Everyone switch** replacing "From people you follow" and "Just logged", built now
     rather than in step 9. Suggested: newest first, no own logs, "You're all caught up with friends" then Everyone,
     about 10 logs then "See more".
  2. **How votes on a review look.** The thumbs are Agree / Disagree on the *review* (YY built them on 2026-10-30;
     votes on replies don't exist and weren't intended), but they read as votes on the episode. Options borrowed from
     Letterboxd: **C** a "Review by @name" byline with "Agree" / "Disagree" in words (Claude's lean; matches the stored
     names), or **D** the review tucked under the episode with "Good take?" (needs notification and email wording
     changed). Earlier A (labeled pills) and B (Reddit arrows with one score; hides 2–2 splits) didn't land. Keep YY's
     rule: small black icons, no bubbles.
  3. **"Talked about this week"** at the end of Home: the 3 episodes (not comments) with the most replies and votes in
     7 days, hidden on quiet weeks. Open: show a preview of the top review, or only counts.
  4. **The Everyone view holds Hooked activity only;** trending topics, hot episodes and charts go to Search. This
     changes "Home and Friends" below.
  5. **The Search layout:** not worked through yet (order, renaming "Trending" topics, whether logging is obvious).
- The mockups were throwaway pages in a session folder and are gone. Redraw them if YY wants to see them (Claude offered
  to publish them as a page linked from the doc).

**Done and live:** steps 1–6, and step 7 stages A, B and C (all of it). Every migration through
`20261103120000_show_refs_are_keys.sql` is applied to both databases. Details of each stage: `docs/DATA_MODEL.md`.

Stage C, in short (PRs #17–#22):
- **Short addresses** (`/episode/k3x9q2ab`) everywhere. Links go through `episodeHref` / `showHref` / `logHref` in
  `lib/addresses.js`; old Podcast Index addresses still redirect.
- **Our own ids are the keys.** Logs, Up next, sends, replies, reactions, notifications and the player use
  `episode_ref`; hooked shows use `show_ref`. The Podcast Index numbers (`episode_id`, `feed_id`) are optional and
  still filled when known. Logs find their show through their episode (`logs.episode_ref → episodes.show_id`).
  In the app, compare with `sameEpisode` / `findLog` / `inUpNext` / `sameShow` / `findHookedShow` (`lib/store.js`).
- **Shows Podcast Index lacks** come in from their own feed (found through Apple; only feeds Apple lists are read) or
  as basic Spotify-only entries (`importFeedShow`, `spotifyEpisode` in `lib/catalog.js`). Erin's Michelle Collins link
  works. Podcast Index's #223945 was never that show: it's "Midnight Snack with Michelle Collins", which an old name
  search accepted without checking the title.

Smaller changes also live (PRs #20, #23, #24): a **Sign in** button on the Search and Briefs headers when signed out;
**"+3 more"** under Hooked on (My log) opens `/me/hooked`, a grid of every hooked show; **"Log it"** shows your stars
("★ 4.5") or "✓ Logged" once you've logged an episode (`LogButton` in `components/Social.js`, used everywhere).

**Also waiting on a decision (Erin and YY): what "hooked" means.** Today it's set in two places: every log asks "I'm hooked /
I'm not hooked" (required, `logs.hooked`), and show pages have an optional "Hooked on this?" toggle (`hooked_shows`).
Erin finds asking on every log clunky. Options discussed on 2026-11-03:
- **A (recommended):** keep both, but pre-select "I'm hooked" when logging an episode of a show you're hooked on, with
  a note ("Pre-picked because you're hooked on …"). Also make the toggle the single source of truth: the first log
  marked hooked hooks the show; after that only you turn it off. No filters, stats or feeds change.
- **B:** hooked only at show level; logs get stars and a hook line only. About a day of work, mostly wording: the
  Diary filter, "is hooked on / wasn't hooked by" feed lines, hooked %, "3 of 5 hooked", Wrapped, For you picks and
  share text all need new meanings. Small migration (existing hooked logs → hooked shows), nothing deleted.

**Next:** whatever Erin and YY decide in the Home and Search doc (above), or A or B for "hooked". Otherwise, the next planned work:
- **Stage D** (remove the old Podcast Index number columns and copied details) after both of you have used stage C
  live for about a week with nothing missing, so **not before about 2026-11-10**. Back up first (export, as below),
  rehearse with `scripts/rehearse-migrations.mjs`, test database, then live.
  **Before writing stage D, go through every place that reads the copied columns, one by one.** If code asks
  the database for a column that's gone, the whole request fails, not just that field, so a page can go blank.
  **Decided 2026-11-07 (Erin): `logs`, `recommendations` (sends) and `list_items` (Up next) lose their copies**
  (`episode_id`, `feed_id`, `title`, `image`, `feed_title`, `feed_image`, and on logs `audio`, `duration`): they
  all point at our episodes. Notifications keep theirs (a snapshot of that moment). Then switch each reader to the episode and show through the log's link
  (`episode:episodes!logs_episode_ref_fkey(..., show:shows(...))`), as #30 did for For you and Popular on Hooked.
  Still to check (as of 2026-11-07, found with `grep -rn 'from("logs")\|feed_title\|feed_image' app lib components`):
  - [x] `lib/store.js`: your own logs (stage D prep 2)
  - [x] `lib/store.js`: Up next (`list_items`) reads (prep 3)
  - [x] `lib/supabase/public.js`: profile logs, a shared log (`?from=`), show ratings (prep 2; old `episode_id` / `feed_id` fallbacks removed)
  - [x] `app/u/[handle]/page.js`: profile logs (prep 2, through `getProfilePage`)
  - [x] `components/Friends.js`: friends' activity on Home (stage D prep 1, through `lib/log-episode.js`)
  - [x] `components/Friends.js`: Sent to you (prep 3)
  - [x] `components/Account.js`: Just logged, and reviews on episode pages (stage D prep 1)
  - [x] `app/api/cron/digest/route.js` and `lib/digest.js`: friends' logs in the weekly email (prep 2)
  - [x] `lib/social.js`: nothing to change (sends are saved in `lib/store.js`; notifications keep their copies)
  - [x] Search again (prep 3, 2026-11-07): every remaining `feed_title` / `feed_image` is page code fed by `withEpisode`,
    or a save. Wildcard selects (`*`) are only on tables that keep their columns, and don't fail when columns go.
  - [ ] **Stage D itself, in one PR:** a migration that drops the copied columns from `logs`, `recommendations` and
    `list_items` (and `logs.title`'s required rule with them), plus the saves that stop sending them (`logToDb`,
    `listToDb`, the send insert in `lib/store.js`). Back up live, compare copies with our tables on the fresh export
    (prep 1 did this: identical), rehearse, test database, then live.
  - [ ] Run the search again just before stage D, in case new code added readers.
  - [ ] **Open question:** hooked shows (`hooked_shows`) also keep copies (`feed_id`, `title`, `image`), and profiles ask
    for them by name (`getProfilePage`). Drop them in stage D too (switch those two reads to `shows` first), or keep them?
- ~~Still on Podcast Index numbers: For you, Wrapped's genres, briefs~~ (done 2026-11-07, #29, #30, #32; topic search
  in briefs stays on Podcast Index until step 8).
- Step 8: listening progress synced to your account, then better search (our `shows`/`episodes` tables have a
  `search` column ready; today Search only adds our feed/Spotify shows by title).

**Follow-ups, small:**
- Check the daily catalog job ran: Vercel → Logs, path `/api/cron/catalog`, 09:00 UTC. It now also re-reads 5 feed
  shows per run (`refreshStale` in `lib/catalog.js`).
- Turn on Supabase → Authentication → "Leaked password protection".
- Rotate the Podcast Index API secret (it was shared in chat on 2026-10-31).
- New code is still JavaScript: TypeScript (decided above) needs its own small setup PR first.
- Spotify-only shows are matched by title, because Spotify's episode page didn't expose the show's own id. Fine so far.
- Redraw the share images (see Known issues) and tidy the lint warnings over time: **87** on main, 0 errors. Most are
  `react-hooks/refs` in `components/Player.js` (the player reads its queue from a React ref while drawing, and each
  field read counts). To compare warnings between two versions, use `npx eslint -f json .`: the `unix` format isn't
  available, and an empty comparison once hid two new warnings.

**Testing notes (what worked):**
- **Signed-in checks of Home (2026-11-07):** a small script with the test service key made two throwaway accounts
  (invite, admin create with a password, profile with a handle), gave one some logs, had it send the other four
  episodes, and made the first follow it. Then build against the test database, `next start`, sign in at 390px with
  Playwright, and delete the accounts (rows cascade) and invites afterwards. The script lived in the session folder;
  rewrite it from this note. Rows written by hand must look like the app's: a log with no `feed_title` crashed Search
  (fixed in #27).
- `next dev` against the test database gives readable error traces when a production build only shows a digest.
- The Playwright tool writes `.playwright-mcp/` into the repo folder: delete it before committing.
- The preview link is in Vercel's comment on the PR: `gh api repos/yylee83/hooked/issues/<pr>/comments`.
- **Database changes:** export live first (`scripts/export-live.sql`, see below), then
  `node scripts/rehearse-migrations.mjs <export.json> <last applied migration> scripts/checks/<file>.sql`. It loads the
  copy in memory, applies newer migrations, and runs checks written as real saves by signed-in people. Also run the
  checks **without** the new migration: the ones about the change must fail, or they aren't testing it (one check
  passed for the wrong reason until this was tried).
- **Running the app against the test database:** build with the test project's public URL and anon key
  (`supabase projects api-keys --project-ref wxbpizgeauuomagbmwja`). `NEXT_PUBLIC_*` values are baked in at build time,
  so rebuild; `.env.local` points at **live**. Add `SUPABASE_SERVICE_ROLE_KEY` (test) at start time when a test needs
  the server to save shows or episodes. Locally there are no Podcast Index keys, which behaves like "Podcast Index
  doesn't have it"; Vercel previews do have them.
- **Signed-in tests:** make a throwaway account on the **test** database only (add its email to `allowed_emails`,
  create it with the admin API and a password, give it a handle), and delete the account, its rows and the invite
  afterwards. Copied accounts have no password; previews need an email link.
- **Signed out,** the app keeps logs and hooked shows in the browser (`localStorage` key `hooked:v1`), which makes
  quick visual checks easy. Sessions live in a cookie (`sb-<project>-auth-token`): clear it to be truly signed out.
- **Previews are behind Vercel's login:** fetch them with the Vercel MCP's `web_fetch_vercel_url`, not curl.
- **Reading the live database** from a session needs Erin's OK (the safety check blocks it). The latest backup, or
  the public pages (`/u/<handle>`, `/show/…`), usually answer the question instead.
- **Test database state:** a copy of live from 2026-11-02 plus everything tested since, including The Michelle
  Collins Show (`2e369h3s`, 255 episodes) and Erin's log of "Sensor Sensibility". Refresh it from live whenever (below).
- Backups of live: `~/claude/hooked-backups/` (latest `live-2026-11-03-before-c3-show-refs.json`).

**Working with the two databases:**
- Live: `hooked` (`ltdjzjbqhojhtahewgtd`), linked from this folder. Test (previews): `hooked-test` (`wxbpizgeauuomagbmwja`).
- Keep the test link in its own folder so this one stays linked to live:
  `mkdir -p ~/claude/hooked-test-link && cp -R supabase ~/claude/hooked-test-link/ && rm -rf ~/claude/hooked-test-link/supabase/.temp`
  then `supabase link --project-ref wxbpizgeauuomagbmwja --workdir ~/claude/hooked-test-link`. Copy new migrations into
  it, then `supabase db push --workdir ~/claude/hooked-test-link`.
- Refresh the test data from live: run `scripts/export-live.sql`, save the result outside the repo, then
  `python3 scripts/make-test-seed.py <export.json> ~/claude/hooked-test-link/supabase/seed.sql` and
  `supabase db reset --linked --workdir ~/claude/hooked-test-link`. This wipes the **test** database only. Check
  `supabase/.temp/project-ref` in that folder says `wxbpizgeauuomagbmwja` first.
- Backups of live data: `~/claude/hooked-backups/` (outside the repo; they hold email addresses).

## Decisions (agreed 2026-10-31)

| Topic | Decision |
|---|---|
| Base code | YY's repo. Keep everything already built: the player, follows, comments, notifications, sends, reactions, Up next, Wrapped, briefs with clips. |
| Name | **Hooked** (not "Hooked on"). The name lives in `lib/site.js`. |
| Who can see what | Anyone can browse without an account. You need an account to log, review, react, follow, send or make a brief. |
| Who can sign up | Invite list only (`allowed_emails`), checked by Supabase itself before an account is created, whatever the sign-in method. |
| Sign-in | Keep the current email + password and magic link. Add Google later. |
| Data model | Erin's: our own `shows` and `episodes` tables, filled from Podcast Index and RSS, store episode details and metadata. Logs, reactions, briefs and so on point at them, and we can add our own metadata. |
| Relistens | One log per person per episode (no relisten tracking). |
| Existing data | Back it up, build the new tables beside the old ones, copy the data over, and delete the old tables only after we've both checked it. |
| Database changes | Numbered files in `supabase/migrations/`, applied with the Supabase CLI. No more pasting SQL by hand. |
| Code | JavaScript and the one `app/globals.css` stay. New code is written in TypeScript; old files move over only when we're already changing them. No Tailwind. |
| Branches | Every change goes on a branch with a Vercel preview link. Merge to `main` only after we've both tried it on our phones. |

### Home and Friends

**Under review (2026-11-07):** the proposal is that Everyone shows only Hooked activity, with trending topics, hot
episodes and top charts moving to Search. See the Home and Search decisions doc in "Where we left off".

- Home gets a switch at the top: **Everyone | Friends**. It always opens on Everyone.
- **Everyone** is the whole app's view: trending topics, the most-liked reviews, hot episodes, top charts, new briefs.
- **Friends** is the view from the people you follow, the ones whose taste you trust:
  - listening now and sent to you (already built)
  - episodes your friends are hooked on, ranked by how many hooked them and how they rated them
  - best reviews from friends
  - shows your friends love
  - briefs by friends
  - a link to People (Following, Followers, Find people)
- Episode and show pages show friends' ratings next to everyone's, for example "Friends: 4.5 from 3 · 2 hooked".
- The count line on My log and on profiles becomes tappable: "12 following · 9 followers".
- Later: marking close friends whose ratings count more, and a taste-match score.

## Order of work

Each step is its own branch and pull request.

1. ~~Rename to Hooked.~~ (done)
2. ~~The player remembers your place on this device~~ (done).
3. ~~People page with Following, Followers and Find tabs, plus tappable counts~~ (done).
4. ~~Baseline migrations, lint and build checks, safe fetching~~ (done).
5. ~~Invite-only sign-up~~ (done: `allowed_emails`, the `hook_invite_gate` check, a friendly message for uninvited emails).
6. ~~Trending topics over 48 hours~~ (done; needs `SUPABASE_SERVICE_ROLE_KEY` in Vercel): save each Google Trends fetch and show the topics that came up most over the last two days. (Google's feed ignores time windows, so we keep our own memory.)
7. New data model: our own `shows` and `episodes`, switched over in four stages (add, write both, switch, tidy). Design: `docs/DATA_MODEL.md`. **A, B and C done and live (2026-11-03); D after about a week of C live.**
8. Listening progress saved to your account (synced across devices), then better search.
9. Home split into Everyone and Friends, and friends' ratings on episode and show pages. (The first part of the Home
   tidy-up is done in #26; the switch may move earlier, see the decisions doc.)
10. Google sign-in.

## Known issues

- ~~Preview links use the live database~~ (done 2026-11-01: previews use the `hooked-test` project, a copy of live).
- The link-preview picture (`app/opengraph-image.png`, `twitter-image.png`) still says "hooked on". It needs redrawing, ideally as code so it follows `site.name`.
- To sign in on a preview link, use "Email me a sign-in link" or "Forgot password?" (the test database's copied accounts have no password).
- Search results are weak. This waits for step 7, because better search needs episode descriptions stored in our own database.
- ~~Safe-fetch guard~~ (done: `lib/safe-fetch.js` for pasted Spotify short links, share-image covers and transcripts).
