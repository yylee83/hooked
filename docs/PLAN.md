# Hooked: merge decisions and plan

Erin and YY built two versions of Hooked in parallel. This repo (YY's) is the shared base. This file records what we decided and the order we're doing the work in. Update it when a decision changes.

## Where we left off (2026-11-11)

**Start Claude Code in `~/claude/hooked-shared`** (`cd ~/claude/hooked-shared && claude`). `~/claude/hooked` is Erin's
archived first version: don't build from it.

**First thing next session:** `gh pr list --repo yylee83/hooked`, then `git checkout main && git pull`. As of
2026-11-11 nothing was open (#51–#54 merged) and nothing is waiting for `supabase db push`: every migration through
`20261111120000_finished_episodes.sql` is on **both** databases.

**Decided 2026-11-11 (Erin):**
- **Searching our own tables is on hold** until Erin and YY have used search longer and have real misses to test
  against. When it's built: our tables only fill gaps (shows and episodes Podcast Index lacks, show-note matches), ranked
  by exactly the same rules; **being on Hooked never boosts a result** (search is for discovering inside and outside
  Hooked, not for pushing what we already have). Ship only if a before/after set of searches is the same or better.
- **Future user matching** ("people with your listening themes"): built on **public logs only** (what people log:
  episode, hooked, stars, hook line, when, and the show). Not private listening, unlogged finishes or searches. So no
  listening-history table is needed for it. Keep saving show categories and episode descriptions and transcripts:
  topics and similarity can be worked out from them later. Matching may say what two people share ("you both love
  narrative history"), built from those public logs.

**Search ranking fix (2026-11-09, #51, live):** "nelson mandela" showed one-episode school-project shows
called "Nelson Mandela" instead of Flipping Tables, The History Hour, etc. Three causes in `lib/rank.js`: an episode's show
name counted on top of its title (now only when the title doesn't already match), possessives were misread
("Mandela’s" became "mandelas"), and the exact-show-name boost and "shows first" on All went to any show with that name
(now it needs 10+ episodes, `MIN_EPISODES` and `namedShow`; Erin chose 10 over 5). Apple's episode order counts more. **All now always lists Shows, then
Episodes** (Erin, 2026-11-09: the same order for every search). Shows with fewer than 10 episodes rank lower (−300), so
a show with some history leads Shows; a brand-new show still comes first when nothing else matches ("metro with sarah
koenig"), and finished short series still lead for their own name (S-Town, 9 episodes), but both drop lower in broader searches ("serial"). Episode and show ranking moved from
`lib/podcastindex.js` into `rankEpisodes` / `rankShows` in `lib/rank.js` so they can be tested without Podcast Index.
Checked against Apple's answers for 12 searches (nelson mandela, kara swisher, smartless, hit parade, the daily, michelle
collins, tradwives, taylor swift, barack obama, serial, the rest is history, mandela effect): same or better. An episode
with only part of your search in its title ("Mandela and the Death of Apartheid") is kept now but ranks below
full-name titles.

**"Log it?" after listening (2026-11-11, #54, live):**
Erin's request. Reaching the last minute in Hooked's player asks to log the episode in the player itself (stars + Hooked /
Not hooked); ✕ or finishing with the screen off moves it to "Finished, not logged" at the top of My log's Episodes tab
(3 days; Skip ends it). Signed in, that list syncs across devices (`20261111120000_finished_episodes.sql`). "Within a minute of the end" also became the rule for starting over instead of resuming, and stopping there now
takes the episode out of the player (before, it came back at 0:00 on reopening or signing in; Erin noticed it live).
Stars are in the prompt because hooked may move to show-level later; then Hooked / Not hooked becomes one "Log it" button.

**Trending conversations on Home (2026-11-09, #52, live):** a section after Just logged listing up to 3 episodes people are talking about (Erin's request; answers most of
Decision 3 in the decisions doc). Ranked by the database function `trending_conversations`
(`20261109120000_trending_conversations.sql`): reviews with a hook line, replies and sends from the past week, each person
once per episode, worth half as much every 48 hours, replies to your own review left out, 2+ people needed, one episode
per show. Each row: episode, show, "4 reviews · 7 replies · 2 sends", and the top review (scored like episode pages).
Sends are private, so the function returns totals only. Test: `node scripts/check-trending.mjs`. Already applied to the
**test** database, and the test people were re-made there on 2026-11-09 (new password; Erin has it).

**Everything else is merged and live (#33–#54).** Also #53: Search's "Their newest episodes" is now "Latest from the top shows". In short:
- **Stage D prep and step 1 (#33–#38):** every page reads episode and show details from our tables; saves always carry
  our ids (`/api/catalog/ensure`). Step 2, the database change, is next (below).
- **Step 8, listening sync (#41):** where you stopped is saved to your account (`listening_progress`,
  `lib/progress-sync.js`). Opening Hooked or switching back to the tab shows what you played last on any device, paused
  5 seconds early; newest wins; a device that's playing isn't interrupted.
- **Step 9, better search, part 1 and part of 2 (#42–#47):**
  - Shows Apple knows but Podcast Index doesn't stay in results (`lib/search.js`; tapping opens `/show/apple/<id>`).
  - Show ranking: the name before ":" or "|" counts as the name, Apple's top answers weigh more, other languages rank
    lower, duplicates go, description-only matches are dropped; "All" puts shows first when you typed a show's name.
  - **"Filter:"** pills always under the search box (`components/SearchFilters.js`): All · Episodes · Shows · Friends
    (Friends only when signed in; the server guesses from the sign-in cookie so the pill doesn't pop in, #47).
  - **Friends** = episodes people you follow logged that match your words (`components/FriendsResults.js`).
  - **People and Briefs sections in All** (no extra pills; `lib/search-community.js`), with "See all" views.
  - **Speed (#45):** Podcast Index answers are cached by the question (`unstable_cache` in `call()`,
    `lib/podcastindex.js`): repeat searches make 0 requests; 8-second timeout.
- **Show pages: "Load more" episodes (#44)**, 30 at a time.
- **Briefs page (#48, #49):** a search bar (briefs only, `/briefs?q=`), built-in briefs as a **"Hooked selects"** swipe
  row, listener briefs in a 2-column grid, and every card shows the same details: shows · run time · (Just the parts) ·
  who made it ("Hooked" for built-in). `components/BriefCards.js`; built-in card details come from `curatedSummary`
  (`lib/briefs-server.js`, kept 6 hours).
- **#49 fixed a live CSS clash:** a new `.brief-chip` rule squashed the brief chips on profiles and My log. `globals.css`
  is one shared file, so check a class name isn't used before adding it (`grep -rn "name" app components`), and prefix
  new ones with their component (`.search-filters`, `.brief-card`). It happened twice this session.

**Waiting on Erin and YY (don't build until they decide).** All in the decisions doc,
[Hooked: Home and Search decisions](https://claude.ai/artifact/CLGuhPA7uZ96u7NESmvXKZ) (Claude Docs), which got a new
section on 2026-11-08, "Update, November 8: what's built since", and two new checklist items:
  1. **One feed with a Friends | Everyone switch** on Home (would match the Friends filter on Search).
  2. **How votes on a review look** (Claude's lean: C, a "Review by @name" byline with "Agree" / "Disagree" in words).
  3. **"Talked about this week"** at the end of Home.
  4. **The Everyone view holds Hooked activity only;** trending, hot episodes and charts on Search (fits what's built).
  5. **The Search layout:** now mostly answered by what's built.
  6. **New: what goes in Hooked selects,** and refreshing the two built-in briefs (Podcast Index now finds only 2 of 4
     episodes for The Midterms and 3 of 4 for Tradwives). A "featured" switch so they can pick selects is an idea.
  7. **New: the search results line** (e.g. "4.5★ from 12 on Hooked · 3 friends"): needed before search #1 below.
  8. **What "hooked" means** (options A and B below; Erin chose to wait for YY).

**Before the review with YY:** Erin runs `TEST_PEOPLE_PASSWORD='…' node scripts/seed-test-people.mjs --friends-with erin`
(once #50 is merged) so previews have friends, logs, replies and sends. Test database only; `--remove` cleans up. The
test database currently has **no** test people. Real people Erin invites go on **live** through `allowed_emails`.

**Next, in Claude's suggested order:**
1. **Stage D step 2, on or after 2026-11-17** (moved from 11-10 by Erin on 2026-11-09; the checklist below): one PR with the migration that drops the copied
   columns. Back up live first, rehearse with `scripts/rehearse-migrations.mjs`, test database, then Erin pushes.
2. **Search #1, Hooked data in results** (our ratings and friends next to each result), once the results-line wording
   is decided (item 7).
3. **Search, still open:** search our own `shows` / `episodes` tables for All / Episodes / Shows (their `search` column
   is ready), and save what searches find into them (**on hold**, see "Decided 2026-11-11"); **#3 topics** (guests and AI topic tags from descriptions and hook
   lines, in new `topics` / `episode_topics` tables; no free-typed tags on the log sheet); **#5 suggestions as you type**.
4. Whatever Erin and YY decide in the doc; step 10 (Home Everyone | Friends) depends on it.

**Decided earlier, still true:**
- Stage D drops the copied details from **logs, sends, Up next and hooked shows**; **notifications keep theirs** (a
  snapshot). Also drop `episode_id` from replies and reactions. Stage D is two steps because the copies had a hidden
  job (a save without our id made the database create the entry from them); step 1 moved that to the server.
  Walkthrough that worked for Erin: "today the database builds the record from what your phone sends; after, the server
  builds it from Podcast Index, one step earlier."

**What "hooked" means (waiting on YY).** Today it's set in two places: every log asks "I'm hooked / I'm not hooked"
(required, `logs.hooked`), and show pages have an optional "Hooked on this?" toggle (`hooked_shows`). Erin finds asking
on every log clunky, and on 2026-11-07 noticed her profile's "Hooked on" lists only 2 shows (the ones she toggled) next
to "9 hooked" (hooked logs, from 7 shows). Not a bug: nothing links the two. Options (2026-11-03):
- **A (recommended):** keep both, but pre-select "I'm hooked" when logging an episode of a show you're hooked on, with
  a note. The toggle becomes the single source of truth: the first log marked hooked hooks the show; after that only
  you turn it off. A one-time catch-up adds the show of every hooked log (nothing deleted).
- **B:** hooked only at show level; logs get stars and a hook line only. About a day of work, mostly wording (the
  Episodes-tab filter, feed lines, hooked %, Wrapped, For you, share text). Small migration, nothing deleted.

### Stage D checklist

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
  - [ ] **Stage D step 2 (on or after 2026-11-17), in one PR:**
    - a migration that drops the copied columns from `logs`, `recommendations`, `list_items` and `hooked_shows` (with
      their required rules, e.g. `logs.title`, `recommendations.title`, `list_items.title`), and `episode_id` from
      `comments` / `reactions` (with the old `(log_user_id, episode_id)` keys);
    - the save triggers rewritten so they no longer create entries from copies (a save without our id is refused), and
      the notification triggers taking the title from `episodes`;
    - the saves that stop sending the copies (`logToDb`, `listToDb`, `hookedToDb`, the send insert in `lib/store.js`).
    Back up live, compare copies with our tables on the fresh export (prep 1 did this: identical), rehearse with
    `scripts/rehearse-migrations.mjs`, test database, then live.
  - [ ] Run the search again just before stage D, in case new code added readers. Added since 2026-11-07:
    `components/FriendsResults.js` (reads logs through `withEpisode`, fine) and `scripts/seed-test-people.mjs` (tries
    without the copies first; its `copies` fallback can go after step 2).
  - [x] Hooked shows (`hooked_shows`): **decided 2026-11-07 (Erin), drop their copies (`feed_id`, `title`, `image`) in
    stage D too.** Reads switched in prep 4 (`withShow` in `lib/log-episode.js`: My log and profiles). Covers now come from
    our `shows` (the show's own feed), like show pages; the copies were Apple's versions of the same art.

**Follow-ups, small:**
- Re-check `/api/catalog/ensure` against the real Podcast Index on a preview or live (local tests used a stand-in).
- **Test people (written 2026-11-08, `scripts/seed-test-people.mjs`):** test users go on the **test** database only
  (fake activity on live shows up in Just logged, Popular on Hooked, friends' feeds, the digest and Wrapped). Run
  `TEST_PEOPLE_PASSWORD='…' node scripts/seed-test-people.mjs --friends-with erin` before the Home review and after
  each test refresh (a refresh from live wipes them): 5 people (`maya.test` … `theo.test`, @example.com emails), ~24 logs
  over 10 days, votes, replies, 4 sends to @erin. `--remove` deletes them. It only ever talks to `hooked-test`, and
  gets the key from the Supabase CLI. Real invitees go on live via `allowed_emails`.
- Check the daily catalog job ran: Vercel → Logs, path `/api/cron/catalog`, 09:00 UTC. It now also re-reads 5 feed
  shows per run (`refreshStale` in `lib/catalog.js`).
- Turn on Supabase → Authentication → "Leaked password protection".
- Rotate the Podcast Index API secret (it was shared in chat on 2026-10-31).
- New code is still JavaScript: TypeScript (decided above) needs its own small setup PR first.
- Spotify-only shows are matched by title, because Spotify's episode page didn't expose the show's own id. Fine so far.
- Redraw the share images (see Known issues) and tidy the lint warnings over time: **86** on main (2026-11-09), 0 errors. Most are
  `react-hooks/refs` in `components/Player.js` (the player reads its queue from a React ref while drawing, and each
  field read counts). To compare warnings between two versions, use `npx eslint -f json .`: the `unix` format isn't
  available, and an empty comparison once hid two new warnings.

**Testing notes (what worked):**
- **Test people for signed-in checks (2026-11-08):** `scripts/seed-test-people.mjs` (test database only) replaces the
  hand-written throwaway-account scripts. Sign in as `sam.test@example.com` with the password you gave it.
- **Playwright (2026-11-08):** `playwright-core@1.58.0` installed in the session folder, launched with `executablePath`
  pointing at the browser already downloaded in `~/Library/Caches/ms-playwright/chromium-1217/` (newer Playwright
  versions want a browser that isn't there). Check at 390×844.
- **Counting Podcast Index requests:** the stand-in Podcast Index (below) can count requests; that's how the search
  cache was proven (a repeat search went from 20–33 requests to 0, and still worked with the stand-in turned off).
- **Previews from a script:** the Vercel MCP's `get_access_to_vercel_url` gives a share link that Playwright can open
  without Vercel's login.
- **Proving a fix:** turn the fix off and check the test fails (done for the Friends pill, #47).
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
7. New data model: our own `shows` and `episodes`, switched over in four stages (add, write both, switch, tidy). Design: `docs/DATA_MODEL.md`. **A, B and C done and live (2026-11-03). D: prep and step 1 in PRs #33–#38 (2026-11-07); step 2 (the database change) on or after 2026-11-17.**
8. ~~Listening sync: where you stopped in each episode is saved to your account, so you can pick up on another device~~
   (done 2026-11-08, #41).
9. Better search (**in progress**: part 1, the filters, Friends, People and Briefs, and caching are done, #42–#47; see
   "Where we left off" for what's open): search our own `shows` and `episodes` (their `search` column is ready), so results include shows
   Podcast Index lacks and episodes found by their descriptions. Topic search in briefs moves off Podcast Index too.
10. Home split into Everyone and Friends, and friends' ratings on episode and show pages. (The first part of the Home
   tidy-up is done in #26; the switch may move earlier, see the decisions doc.)
11. Google sign-in.
12. Later: user matching (find people with your listening themes) from public logs only; see "Decided 2026-11-11".

## Known issues

- ~~Preview links use the live database~~ (done 2026-11-01: previews use the `hooked-test` project, a copy of live).
- The link-preview picture (`app/opengraph-image.png`, `twitter-image.png`) still says "hooked on". It needs redrawing, ideally as code so it follows `site.name`.
- To sign in on a preview link, use "Email me a sign-in link" or "Forgot password?" (the test database's copied accounts have no password).
- ~~Search results are weak~~ (much better since #42–#47; searching our own tables is still to do, step 9).
- The two built-in briefs (The Midterms, Tradwives) now find only some of their episodes on Podcast Index: refresh them.
- ~~Safe-fetch guard~~ (done: `lib/safe-fetch.js` for pasted Spotify short links, share-image covers and transcripts).
