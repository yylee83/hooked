# Reports, blocks and removing things

How Hooked keeps conversations safe, and what the team does when something is reported. (Built 2026-11-24.)

## What people can do

Every review, reply, list and profile by someone else has a small **"…"** (only when you're signed in):

- **Report**: pick a reason (spam, bullying, hate, sexual, spoilers, something else) and add a note if you like. Only the
  team sees reports, and the person isn't told who reported them.
- **Block @someone**: you stop following each other, they can't follow you, reply to or react on your reviews, or send
  you episodes, and their reviews and replies are hidden from you. Nothing they do notifies you. They aren't told.
  To undo it: their profile → "…" → Unblock.

Swear words and slurs are already refused when people type them (`banned_words`, see CLAUDE.md "Clean language").

## When a report comes in

1. **You get an email** at hello@hookedonpods.com: what was reported, by whom, the reason, the words as they were, and a
   "See it on Hooked" button. (Live site only, and only once `RESEND_API_KEY` is set. Previews email `EMAIL_TEST_TO`.)
2. **See every report** in Supabase → project `hooked` → Table Editor → **insights_reports** (open ones first, newest
   first). The `link` column opens it on the site.
3. **Decide.** Most reports need nothing, or a block by the person who reported. If it should go:

| To remove | Supabase → Table Editor → | Find the row by | Then |
|---|---|---|---|
| A review | `logs` | `user_id` = the reported person's id (from `reports.reported_user_id`) and `episode_ref` | Delete row (its replies and thumbs go with it) |
| Just the words of a review, keep the stars | `logs` | same as above | Clear the `hook` cell |
| A reply | `comments` | `id` = `reports.comment_id` | Delete row |
| A list | `briefs` | `id` = `reports.brief_id` | Delete row |
| A handle or name | `profiles` | `id` = `reports.reported_user_id` | Change `handle` / `display_name` |
| A whole account (spam, repeated abuse) | Authentication → Users | their email | Delete user: removes everything they made. Also delete their email from `allowed_emails` so they can't sign up again |

4. **Close the report:** in the `reports` table, set its `status` to `done` (acted on) or `dismissed` (nothing needed).

## Under the hood

- Migration `supabase/migrations/20261124200000_reports_blocks.sql`: tables `reports` and `blocks`, the checks that stop
  follows, replies, reactions and sends between blocked people (error code `HKB01`), and the `insights_reports` view.
  The app can add a report but never read one; the database copies the reported words in, so editing or deleting them
  afterwards doesn't erase the evidence. One report per person per thing, at most 20 a day.
- App: `components/MoreMenu.js` (the "…" and its sheet), `lib/report-client.js`, `block` / `unblock` / `isBlocked` in
  `lib/store.js`. Hidden from the blocker: replies (`LogThread`), reviews on episode pages (`EpisodeLogs`), Top
  conversations on Home.
- Email: `lib/report-email.js`, sent right away through `/api/report-email`, with the daily `/api/cron/notify-email` as a
  catch-up. Optional `REPORTS_TO` sends them somewhere other than hello@.
- Test: `node scripts/check-reports-blocks.mjs`.
