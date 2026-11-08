# Hooked: merge decisions and plan

Erin and YY built two versions of Hooked in parallel. This repo (YY's) is the shared base. This file records what we decided and the order we're doing the work in. Update it when a decision changes.

## Where we left off (2026-11-07, evening)

**Start Claude Code in `~/claude/hooked-shared`** (`cd ~/claude/hooked-shared && claude`). `~/claude/hooked` is Erin's
archived first version: don't build from it.

**First thing next session:** check which of the open PRs below Erin has merged (`gh pr list --repo yylee83/hooked`),
then `git checkout main && git pull`. None of them changes the database, so there's nothing to `supabase db push`.

**Open PRs, merge in this order** (each builds on the one before, and shows the earlier ones' commits until they merge):
1. **#33 Stage D prep 1:** Home ("Just logged", friends' activity) and episode-page reviews read episode details from
   our tables. Adds `lib/log-episode.js` (`LOG_EPISODE`, `withEpisode`).
2. **#34 prep 2:** profiles, show ratings, My log and the weekly email. Shared links and show ratings match by our ids
   only (the old `episode_id` / `feed_id` fallbacks are gone).
3. **#35 prep 3:** "Sent to you" and Up next (`episodeOf(table)`).
4. **#37 prep 4:** hooked shows' names and covers from `shows` (`HOOKED_SHOW`, `withShow`).
5. **#38 Stage D step 1:** saves always carry our ids. New `/api/catalog/ensure` (`ensureRefs` in
   `lib/catalog-client.js`): before saving something it only knows by Podcast Index numbers, the app asks the server,
   which finds or creates the entry from Podcast Index and returns our id.
6. **#39 this plan update.**

Separate, any order: **#36** renames My log's "Diary" tab to **"Episodes"** (the address stays `#diary`).

**Live today (merged):**
- **Off Podcast Index numbers (#29, #30, #32).** Wrapped's genres come from `shows.categories` (feeds' Apple categories
  are now saved too). For you works from our show ids: feed shows use our saved episodes; friends' picks and Popular on
  Hooked read our tables; picks from Podcast Index now show their show name. Briefs carry our ids, a pasted Apple link to
  a feed show's episode works, and Spotify-only links are refused ("only on Spotify, so it can't play in a brief"). Topic
  search in briefs stays on Podcast Index until step 9 (better search).
- **Brief builder (#32, from Erin's testing):** nothing is ticked for you; your picks stay when you search again and the
  list shows only the new results; the title follows the topic until you type one; 8 results then "Show N more"; a
  sticky **"Your brief · N episodes · time"** bar with "Review ↓" (layout A of three mockups; it sits above the mini
  player when one is open).
- **#31:** the stage D checklist (below, under Next).

**Decided today (Erin):**
- Stage D drops the copied details from **logs, sends, Up next and hooked shows**; **notifications keep theirs** (a
  snapshot). Also drop `episode_id` from replies and reactions.
- **Stage D is two steps.** Step 1 (#38, above). **Step 2 on or after 2026-11-10:** the database change. Spelled out
  under Next. Why the split: the copies had a hidden job (a save without our id made the database create the
  episode/show from them), so creating entries had to move to the server first. Erin asked for this explained simply;
  the walkthrough "today the database builds the record from what your phone sends; after, the server builds it from
  Podcast Index, one step earlier" worked.
- **"What hooked means": wait for YY** (see below; Erin hit it on her profile today).

**Test database changes today:** The Michelle Collins Show (`2e369h3s`) was re-read from its feed (now has categories)
and its Apple id restored (`1242084389`; a manual test re-read had blanked it). Every throwaway account, brief and
made-up `999…` show/episode created for tests was deleted.

**Still open from the morning session (Home and Search):** the decisions doc,
[Hooked: Home and Search decisions](https://claude.ai/artifact/CLGuhPA7uZ96u7NESmvXKZ) (Claude Docs; it has a
checklist). Don't build these until Erin and YY have decided:
  1. **One feed with a Friends | Everyone switch** replacing "From people you follow" and "Just logged".
  2. **How votes on a review look** (Claude's lean: **C**, a "Review by @name" byline with "Agree" / "Disagree" in words;
     or **D**, "Good take?" under the episode). Keep YY's rule: small black icons, no bubbles.
  3. **"Talked about this week"** at the end of Home (3 episodes with the most replies and votes in 7 days).
  4. **The Everyone view holds Hooked activity only;** trending topics, hot episodes and charts go to Search.
  5. **The Search layout:** not worked through yet.
  The morning's PRs (#26 slim "Sent to you", + next to the episode, Apple chart to Search; #27 covers survive a missing
  title) are live.

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
Erin finds asking on every log clunky. **On 2026-11-07 she noticed her profile's "Hooked on" lists only 2 shows (the
ones she toggled) next to "9 hooked" (hooked logs, from 7 shows).** Not a bug: nothing links the two. Option A below,
with a one-time catch-up (add the show of every hooked log, nothing deleted), would fix it. Erin chose to wait for YY.
Options discussed on 2026-11-03:
- **A (recommended):** keep both, but pre-select "I'm hooked" when logging an episode of a show you're hooked on, with
  a note ("Pre-picked because you're hooked on …"). Also make the toggle the single source of truth: the first log
  marked hooked hooks the show; after that only you turn it off. No filters, stats or feeds change.
- **B:** hooked only at show level; logs get stars and a hook line only. About a day of work, mostly wording: the
  Episodes-tab (diary) filter, "is hooked on / wasn't hooked by" feed lines, hooked %, "3 of 5 hooked", Wrapped, For you picks and
  share text all need new meanings. Small migration (existing hooked logs → hooked shows), nothing deleted.

**Next:** whatever Erin and YY decide in the Home and Search doc (above), or A or B for "hooked". Otherwise:
- **Stage D step 2, on or after 2026-11-10**, once #33–#38 are merged and have been used live for a couple of days.
  Prep and step 1 are done (checklist below). Back up first (export, as below), rehearse with
  `scripts/rehearse-migrations.mjs`, test database, then Erin pushes it to live.
- **Or step 8** in the meantime: listening sync (where you stopped is saved to your account, across devices). Step 9,
  better search, comes after it.
- Small: re-check `/api/catalog/ensure` against the real Podcast Index on a preview or live (local tests used a stand-in).
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
  - [x] **Stage D step 1 (2026-11-07): saves always carry our ids.** The copies also had a hidden job: a save without our
    id made the database create the episode/show from the copied details (`episode_ref_for` / `show_ref_for` in the
    save triggers). Now the app asks `/api/catalog/ensure` first (`ensureRefs` in `lib/catalog-client.js`, used by
    `addLog`, `addToList`, `toggleHookedShow`, `sendRecommendation` and the sign-in move in `lib/store.js`): the server
    finds or creates the entry from Podcast Index and returns our id. If it can't, the old trigger path still works
    until step 2.
  - [ ] **Stage D step 2 (on or after 2026-11-10), in one PR:**
    - a migration that drops the copied columns from `logs`, `recommendations`, `list_items` and `hooked_shows` (with
      their required rules, e.g. `logs.title`, `recommendations.title`, `list_items.title`), and `episode_id` from
      `comments` / `reactions` (with the old `(log_user_id, episode_id)` keys);
    - the save triggers rewritten so they no longer create entries from copies (a save without our id is refused), and
      the notification triggers taking the title from `episodes`;
    - the saves that stop sending the copies (`logToDb`, `listToDb`, `hookedToDb`, the send insert in `lib/store.js`).
    Back up live, compare copies with our tables on the fresh export (prep 1 did this: identical), rehearse with
    `scripts/rehearse-migrations.mjs`, test database, then live.
  - [ ] Run the search again just before stage D, in case new code added readers.
  - [x] Hooked shows (`hooked_shows`): **decided 2026-11-07 (Erin), drop their copies (`feed_id`, `title`, `image`) in
    stage D too.** Reads switched in prep 4 (`withShow` in `lib/log-episode.js`: My log and profiles). Covers now come from
    our `shows` (the show's own feed), like show pages; the copies were Apple's versions of the same art.
- ~~Still on Podcast Index numbers: For you, Wrapped's genres, briefs~~ (done 2026-11-07, #29, #30, #32; topic search
  in briefs stays on Podcast Index until step 9).
- Step 8: listening sync. Step 9: better search (our `shows`/`episodes` tables have a `search` column ready; today
  Search only adds our feed/Spotify shows by title).

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
- `next dev` against the test database gives readable error traces when a production build only shows a digest. **But
  don't drive `next dev` with Playwright:** the tool writes `.playwright-mcp/` into the repo, the dev server sees the
  change and reloads the page in a loop. Use a production build and `next start` for browser checks.
- **A stand-in Podcast Index (2026-11-07):** a ~20-line Node server answering `/search/byperson`, `/episodes/byid`,
  `/episodes/byfeedid` and `/podcasts/byfeedid`, with `PODCASTINDEX_BASE_URL=http://localhost:<port>` and fake
  `PODCASTINDEX_API_KEY` / `SECRET` at `next start`. Point `ITUNES_*` / `CHARTS_FEED_URL` at it too only when Apple
  must be "empty" (pasted Apple links then can't find feeds). Use made-up numbers (`999…`) and titles that say where
  they came from ("… (from Podcast Index)"), then delete those shows/episodes afterwards.
- **Prove where data comes from,** not just that output matches: save a row with a missing cover or a "PHONE COPY" title
  and check the page or the created entry shows our tables' version.
- **Running `lib/` code directly in Node** (e.g. `parseFeed`, `importFeedShow`, `digestEmail`): a small loader hook that
  maps `@/` to the repo, `server-only` to an empty module and `next/server` to `next/server.js`, then
  `node --import <register.mjs> <script.mjs>`. Rewrite it from this note; it lived in the session folder.
- **Playwright's browser can stay signed in** to an old throwaway account: clear its cookies **and** `localStorage` keys
  starting `sb-` before signed-out checks.
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
  Collins Show (`2e369h3s`, 256 episodes, categories, Apple id `1242084389`) and Erin's log of "Sensor Sensibility".
  Refresh it from live whenever (below).
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
7. New data model: our own `shows` and `episodes`, switched over in four stages (add, write both, switch, tidy). Design: `docs/DATA_MODEL.md`. **A, B and C done and live (2026-11-03). D: prep and step 1 in PRs #33–#38 (2026-11-07); step 2 (the database change) on or after 2026-11-10.**
8. Listening sync: where you stopped in each episode is saved to your account, so you can pick up on another device.
   Today it's kept only on the device you listened on (step 2).
9. Better search: search our own `shows` and `episodes` (their `search` column is ready), so results include shows
   Podcast Index lacks and episodes found by their descriptions. Topic search in briefs moves off Podcast Index too.
10. Home split into Everyone and Friends, and friends' ratings on episode and show pages. (The first part of the Home
   tidy-up is done in #26; the switch may move earlier, see the decisions doc.)
11. Google sign-in.

## Known issues

- ~~Preview links use the live database~~ (done 2026-11-01: previews use the `hooked-test` project, a copy of live).
- The link-preview picture (`app/opengraph-image.png`, `twitter-image.png`) still says "hooked on". It needs redrawing, ideally as code so it follows `site.name`.
- To sign in on a preview link, use "Email me a sign-in link" or "Forgot password?" (the test database's copied accounts have no password).
- Search results are weak. This is step 9 (better search), which needed step 7 first, because better search needs episode descriptions stored in our own database.
- ~~Safe-fetch guard~~ (done: `lib/safe-fetch.js` for pasted Spotify short links, share-image covers and transcripts).
