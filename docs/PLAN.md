# Hooked: merge decisions and plan

Erin and YY built two versions of Hooked in parallel. This repo (YY's) is the shared base. This file records what we decided and the order we're doing the work in. Update it when a decision changes.

## Where we left off (2026-11-02)

**Start Claude Code in `~/claude/hooked-shared`** (`cd ~/claude/hooked-shared && claude`). `~/claude/hooked` is Erin's
archived first version: don't build from it.

Done and live: steps 1–6, and step 7 stages A, B1, B2, C1 and C2 (PR #17: short addresses, plus "Copy link" copying
just the link). Details of each stage: `docs/DATA_MODEL.md`.

**Next: step 7, stage C3**, as separate PRs:
1. ~~The app's own links use short addresses (`/episode/<ref>`) directly~~ (branch `stage-c3-links`). Links go through
   `episodeHref` / `showHref` / `logHref` in `lib/addresses.js`, which use the short id when the data has it and the
   Podcast Index number otherwise (that still redirects). Podcast Index lists get short ids from one lookup
   (`withRefs` / `withShowRefs` in `lib/catalog.js`); episodes we don't have yet keep their number until opened.
   Known gap: show links built from logs use the number (logs have no `show_ref`), until part 3.
2. ~~Logs, Up next, sends, reactions, comments and the player use our episode ids~~ (branch `stage-c3-refs`).
   Migration `20261103000000_refs_are_keys.sql`: `episode_ref` is required and `episode_id` optional on logs, sends,
   replies and reactions; replies and reactions attach to a log by `(user, episode_ref)`; Up next is keyed by
   `episode_ref`; notifications carry it. Rehearsed on a copy of live (`scripts/rehearse-migrations.mjs` with
   `scripts/checks/c3-part2.sql`) and **applied to the test database** on 2026-11-03. **Live:** merge the PR, then
   `supabase db push` (live backup taken: `~/claude/hooked-backups/live-2026-11-02-before-c3-part2.json`).
   Still keyed by Podcast Index numbers, for part 3: hooked shows (`hooked_shows.feed_id`), show ratings and
   "Popular on Hooked" (`logs.feed_id`), briefs, and the For you picks.
3. Shows Podcast Index lacks or has broken.
   - **3a** (branch `stage-c3-feeds`): a pasted Apple or Spotify link that Podcast Index can't match reads the show's own
     feed, found through Apple (`importFeedShow` in `lib/catalog.js`; only feed addresses Apple lists are ever read).
     No feed anywhere: a basic Spotify-only entry ("Listen on Spotify", can't play here). Show pages for these shows list
     our saved episodes; Search lists them too; the daily job re-reads 5 feed shows per run. Test case works: Erin's
     link `https://open.spotify.com/episode/0XYUW3LqZsiOLBzowRkLKw` → "Sensor Sensibility" (show `2e369h3s` on the test
     database, 255 episodes). No database change.
   - **3b** (next): hooked shows, show ratings and "Popular on Hooked" keyed by our show id, so those work for feed and
     Spotify-only shows too (their show pages hide them until then). Also For you picks and briefs.

**Then stage D** (remove the old Podcast Index number columns and copied details) once both of you have used stage C
live for about a week with nothing missing. Back up first.

**Follow-ups, small:**
- Check the daily catalog job ran: Vercel → Logs, path `/api/cron/catalog`, 09:00 UTC. Its first run was 2026-11-02.
- Turn on Supabase → Authentication → "Leaked password protection".
- Rotate the Podcast Index API secret (it was shared in chat on 2026-10-31).
- New code is still JavaScript: TypeScript (decided above) needs its own small setup PR first.
- Redraw the share images (see Known issues) and tidy the lint warnings over time (86 on main after #18). Most are
  `react-hooks/refs` in `components/Player.js`: the player reads its queue from a React ref while drawing, and every
  field read off it counts, so adding one (like `s.ep.ref`) adds warnings without a new kind of problem.

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
7. New data model: our own `shows` and `episodes`, switched over in four stages (add, write both, switch, tidy). Design: `docs/DATA_MODEL.md`. **In progress: A, B, C1–C2, C3 parts 1–2 done; C3 part 3 (3a in review, 3b next) and D left.**
8. Listening progress saved to your account (synced across devices), then better search.
9. Home split into Everyone and Friends, and friends' ratings on episode and show pages.
10. Google sign-in.

## Known issues

- ~~Preview links use the live database~~ (done 2026-11-01: previews use the `hooked-test` project, a copy of live).
- The link-preview picture (`app/opengraph-image.png`, `twitter-image.png`) still says "hooked on". It needs redrawing, ideally as code so it follows `site.name`.
- To sign in on a preview link, use "Email me a sign-in link" or "Forgot password?" (the test database's copied accounts have no password).
- Search results are weak. This waits for step 7, because better search needs episode descriptions stored in our own database.
- ~~Safe-fetch guard~~ (done: `lib/safe-fetch.js` for pasted Spotify short links, share-image covers and transcripts).
