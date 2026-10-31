# Hooked: merge decisions and plan

Erin and YY built two versions of Hooked in parallel. This repo (YY's) is the shared base. This file records what we decided and the order we're doing the work in. Update it when a decision changes.

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

1. Rename to Hooked.
2. The player remembers your place on this device (fixes progress lost when you leave the site).
3. People page with Following, Followers and Find tabs, plus tappable counts.
4. Baseline migrations that match the live database, plus lint and a build check.
5. Invite-only sign-up (`allowed_emails` and the sign-up check), with a friendly message for uninvited emails.
6. Trending topics over 48 hours: save each Google Trends fetch and show the topics that came up most over the last two days. (Google's feed ignores time windows, so we keep our own memory.)
7. New data model: back up, create `shows` and `episodes`, copy the existing data over, switch the code, and remove the old tables.
8. Listening progress saved to your account (synced across devices), then better search.
9. Home split into Everyone and Friends, and friends' ratings on episode and show pages.
10. Google sign-in.

## Known issues

- Search results are weak. This waits for step 7, because better search needs episode descriptions stored in our own database.
- Two server fetches need the safe-fetch guard: the Spotify short-link check in `lib/links.js` (the host check also matches look-alike domains) and cover images in `app/api/og/episode/route.js`. These are part of step 4.
