# Your reach: influence stats (design)

Agreed with Erin, 2026-11-24. Brainstormed in a Claude Code session.

## Why

Three jobs, in Erin's words and order:

1. **Positive feedback for sharing on Hooked.** When your review or send moves someone, you see it, so sharing feels
   worth doing.
2. **Room for Hooked influencers later.** Private for now; may become public, next to follower counts.
3. **A tastemaker finder for Erin and YY.** Who actually moves other people's listening, not just who has followers.

## Goals

- On your own profile, visible only to you, two numbers:
  - **people who want to listen because of you**
  - **episodes added to Up next because of you**
- For Erin and YY, a ranking in Supabase with those two numbers plus **listened** (logged it afterwards).
- "Because of you" means two things for now: someone tapped **+** on your review, or someone queued an episode
  **you sent them**.

## Non-goals

- No single score (Erin chose named stats, option A). The team ranking may combine numbers later; nothing in this design
  stops a public score.
- No "joined through you" (invites) and no "latest moment" line (Erin, 2026-11-24).
- No other sources yet (lists, shares outside Hooked, plays from your profile). The record is built so they can be
  added later.
- No change to Wrapped (it keeps its own "want to listen" line, #155).

## Anti-goals

- **Never reveal someone's private activity.** Built on public actions (+ on a review) and on sends (the sender already
  knows who they sent to; the one accepted exception is below, under "Decided after the first draft"). Never on private listening history, search history or anyone's Up next contents. The person
  only ever sees totals, never names.
- **Numbers never shrink because someone listened.** Up next items come off when played; the stats must not.

## Constraints (from the project)

- Every schema change is a numbered migration; `npm run db:check`; rehearse on a copy of live because the migration
  writes data (the backfill); test database first; Erin pushes to live after merge.
- New functions: `security definer`, `set search_path = ''`, and **revoke from `anon, authenticated` as well as
  `public`**, then grant only what's meant (`scripts/check-history.mjs` mimics Supabase's default grants).
- The profile page (`app/u/[handle]/page.js`) is built on the server **without a sign-in** (`lib/supabase/public.js`),
  so the private section must be a client component that asks the database itself.
- Our ids are the keys: rows point at `episode_ref`, never copies of titles.
- Unique class names in `app/globals.css`, prefixed by component. Mobile first, 390px. Short, warm copy.

## Facts the design rests on (checked 2026-11-24)

- **+ on a review** is a row in `reactions` (`kind = 'adding'`, `user_id` = who tapped, `log_user_id` = whose review,
  `episode_ref`). It lasts; tapping again deletes it. Reactions are public (they show under reviews).
- **Up next** is `list_items` (private, own rows only). A row is **deleted** when the episode starts playing.
  `from_who` is a free-text label, not a person.
- **Sends** are `recommendations` (`from_id`, `to_id`, `episode_ref`). "Not for me" **deletes** the row. "Sent to you"
  rows drop off on screen once queued or logged, but nothing records the queue.
- `my_listening` (`20261120120000_my_listening.sql`) is the model for "your own totals only".

## Approaches considered

1. **Count only what's already saved** (reactions for added, logs for listened). No migration. Rejected: sends would
   only count once logged, never when queued.
2. **A small private record of each moment someone was influenced.** *Chosen (Erin, 2026-11-24).* One place to count
   from, never shrinks, both paths counted the same way, later sources slot in.
3. **A "queued at" date on each send**, plus reactions for +. Slightly less to build, but two places to count from, and
   each future source needs its own patch.

## The design

### 1. The record: `influences` (new table, migration)

One row per (influencer, influenced person, episode, how):

| column | meaning |
|---|---|
| `influencer_id` | whose review or send it was (→ `profiles`, cascade) |
| `user_id` | who was influenced (→ `profiles`, cascade) |
| `episode_ref` | the episode (→ `episodes`) |
| `via` | `'review'` or `'send'` (check constraint; more values later) |
| `created_at` | when |

Primary key `(influencer_id, user_id, episode_ref, via)`, so repeats don't double count. Index on `user_id,
episode_ref` for the "listened" join. RLS on, **no policies**, all access revoked from `anon, authenticated`: the app
never reads or writes it directly. Never someone influencing themselves (check `influencer_id <> user_id`).

### 2. Filling it: database triggers, not app code

So it works whatever screen the action happens on, and old app versions count too:

- **Review:** after insert on `reactions` where `kind = 'adding'` and `user_id <> log_user_id` → insert
  `(log_user_id, user_id, episode_ref, 'review')`, on conflict do nothing. After delete of such a reaction (untapping +)
  → delete that row. *(Claude's call: undoing + undoes the credit, matching how Wrapped counts.)*
- **Send:** after insert on `list_items` → for every send to this person of this episode
  (`recommendations.to_id = new.user_id and episode_ref = new.episode_ref`) → insert
  `(from_id, to_id, episode_ref, 'send')`, on conflict do nothing. Queuing it from anywhere counts (Sent to you, the
  episode page, a review's +). Deleting the Up next row or the send later removes nothing.
- *(Claude's call)* Already logged before the moment → still recorded, but it won't count as "listened because of you"
  (see 4). Kept simple: the + still showed they valued the review.

Trigger functions are `security definer` (they write a table the person can't), `search_path = ''`, revoked from
`public, anon, authenticated`.

### 3. Backfill (same migration)

- Every existing `adding` reaction on someone else's review → a `'review'` row, dated with the reaction.
- Every existing send whose recipient **has logged that episode** → a `'send'` row, dated with the send. *(Claude's
  call: a logged send clearly got them to it. Sends that were only queued, before today, can't be recovered: queuing
  wasn't recorded and Up next rows are gone once played.)*

Rehearse with `scripts/rehearse-migrations.mjs` on a fresh export of live and a checks file in `scripts/checks/`.

### 4. Your totals: `my_reach()` (database function)

`security definer`, `search_path = ''`, uses `auth.uid()` only (no argument naming a person), returns jsonb:

- `people`: distinct `user_id` across your rows, both kinds.
- `added`: count of distinct `(user_id, episode_ref)` pairs. *(Claude's call: two friends adding the same episode
  because of you is 2; the same friend reached by your review and your send for one episode is 1.)*

Granted to `authenticated` only. It returns nothing about anyone else, and no names.

### 5. On your profile

A client component (e.g. `components/YourReach.js`) on `app/u/[handle]/page.js`, rendered only when the signed-in
person is the profile's owner; for anyone else it renders nothing and never calls `my_reach`. *(Claude's call on
placement: the top of your own profile, under the follower counts. My log is the alternative if YY prefers.)*

```
YOUR REACH   only you can see this
 8  people want to listen because of you
14  episodes added to Up next because of you
```

- Sticker look (3px ink outline, hard shadow), Bagel Fat One numbers in cobalt like Wrapped's stat boxes; reuse
  Wrapped's styles where they fit, new classes prefixed `reach-`.
- At zero, one short line instead of zeros: "When someone adds an episode because of your review or send, it shows up
  here." *(Claude's call: a box of zeros reads as failure, the opposite of job 1.)*
- Singular copy: "1 person wants to listen…", "1 episode added…".

### 6. Erin and YY's ranking: `insights_influence` (view)

Like the other `insights_*` views (team reads it in Supabase; revoked from `anon, authenticated`). One row per
influencer: `handle`, `people`, `added`, **`listened`** (pairs where the influenced person logged the episode **after**
the moment), `listened_people`, `via_review`, `via_send`, `followers`. Sorted by `listened`, then `added`.

### 7. Docs and tests

- A `node scripts/check-influence.mjs` in-memory test like `check-invites.mjs`: + creates a row, untapping removes it,
  self + creates none, queuing a send creates one per sender, deleting the Up next row keeps it, `my_reach` returns only
  the caller's totals, anon and authenticated can't select `influences` or the view.
- CLAUDE.md: a line under "Where things are", and the new table in the tables list.

## Left to the builder

- Exact migration name and trigger names; whether the view counts `followers` with a join or a subquery.
- Styling details within the rules above.
- Whether `YourReach` caches its answer the way `useMyListening` does.

## Decided after the first draft

- **A sender may sometimes be able to tell that a friend queued their send** (e.g. someone who has only sent to one
  friend sees "added" go up by one). Erin accepted this (option A, 2026-11-24): queuing a send is close to replying to
  it. Rejected: counting sends only once logged (B), or only in "people" (C, which doesn't remove it).
- Erin approved this design on 2026-11-24, including Claude's calls marked above.
