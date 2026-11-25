# Your reach (influence stats) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show each person, on their own profile only, how many people want to listen and how many episodes were added
to Up next because of their reviews and sends; give Erin and YY a ranking that also counts "listened".

**Architecture:** One migration adds a private `influences` table filled by database triggers (+ on a review, queuing an
episode someone sent you), backfills it, and adds `my_reach()` (your own totals) and the `insights_influence` view (team
only). A small client component on the profile calls `my_reach()` when the viewer is the owner.

**Tech Stack:** Supabase Postgres (migrations, RLS, plpgsql), PGlite for in-memory tests, Next.js 16 / React 19, plain
JavaScript, `app/globals.css`.

**Spec:** `docs/superpowers/specs/2026-11-24-influence-stats-design.md`

## Global Constraints

- Every schema change is a new numbered migration; never edit an existing one. Run `npm run db:check` before pushing.
- New functions: `security definer`, `set search_path = ''`, `revoke all ... from public, anon, authenticated`, then grant
  only what's meant. Tests must copy Supabase's default grants (`alter default privileges in schema public grant execute
  on functions to anon, authenticated, service_role`), as `scripts/check-invites.mjs` does.
- Rows point at our ids (`episode_ref`), never copies of titles. Never put email addresses in a migration.
- Never reveal someone's private activity: the person only sees totals, never names; nothing reads listening/search
  history or anyone's Up next contents.
- The profile page is built on the server without a sign-in; anything private is a client component that asks the
  database itself.
- Class names unique in `app/globals.css`, new ones prefixed `reach-`. Mobile first, 390px. Copy short and warm.
- Before pushing: `npm run lint`, `npm run db:check`, `npm run build`. Never test against the live database.

## Review Focus

1. **Someone taps + on their own review** → no credit (pinned in Task 1).
2. **The same person queues an episode that two different people sent them** → each sender gets credit once
   (pinned in Task 1).
3. **Someone queues, plays (Up next row deleted), then the send is dismissed (row deleted)** → the credit stays
   (pinned in Task 1).
4. **A signed-out visitor or another person views your profile** → the reach section doesn't render and `my_reach` is
   never called; `anon` can't run `my_reach` and nobody but the team can read `influences` or the view (pinned in Tasks
   1 and 3).
5. **A + tapped before today, or a send logged before today** → counted after the migration; a send only ever queued
   before today isn't (pinned in Task 2).

---

### Task 1: The record, its triggers, your totals, the team view

**Files:**
- Create: `supabase/migrations/20261125120000_influences.sql`
- Create: `scripts/check-influence.mjs`

**Interfaces:**
- Produces: table `public.influences (influencer_id uuid, user_id uuid, episode_ref text, via text, created_at
  timestamptz)`, primary key `(influencer_id, user_id, episode_ref, via)`, `via in ('review','send')`,
  `check (influencer_id <> user_id)`, FKs to `profiles` (cascade) and `episodes`; index on `(user_id, episode_ref)`;
  RLS on, no policies, `revoke all ... from anon, authenticated`.
- Produces: `public.my_reach() returns jsonb` → `{"people": int, "added": int}` for `auth.uid()`; `people` = distinct
  `user_id`; `added` = distinct `(user_id, episode_ref)`. Granted to `authenticated` only.
- Produces: view `public.insights_influence` (`security_invoker = true`) with columns `handle, people, added, listened,
  listened_people, via_review, via_send, followers`, ordered by `listened desc, added desc`; `listened` = distinct
  `(user_id, episode_ref)` pairs where `logs` has that user+episode with `logs.created_at > influences.created_at`.
  Revoked from `anon, authenticated`.
- Trigger functions (names are the builder's): after insert on `reactions` (`kind = 'adding'`, `user_id <>
  log_user_id`) → insert `(log_user_id, user_id, episode_ref, 'review')` on conflict do nothing; after delete of such a
  reaction → delete that row; after insert on `list_items` → insert `(r.from_id, new.user_id, new.episode_ref, 'send')`
  for every `recommendations r` with `r.to_id = new.user_id and r.episode_ref = new.episode_ref and r.from_id <>
  new.user_id`, on conflict do nothing.

- [ ] **Step 1: Write `scripts/check-influence.mjs`**, modelled on `scripts/check-invites.mjs` (same PGlite setup, `as(uid,
  sql)` helper, `ok()`), with three profiles A, B, C and one episode row (insert into `public.shows`/`public.episodes`
  the minimum columns the schema requires). Checks:
  - B taps + on A's review (insert `reactions` as B, `log_user_id` A, `kind 'adding'`) → `my_reach()` as A is
    `{people:1, added:1}`.
  - A taps + on A's own review → no `influences` row with `influencer_id = user_id` (and the insert doesn't fail).
  - B untaps (delete that reaction) → A back to `{people:0, added:0}`.
  - A and C each send B the episode (insert `recommendations`), B queues it (insert `list_items` as B) → A and C each
    `{people:1, added:1}`.
  - B's Up next row deleted and A's send deleted → A still `{people:1, added:1}`.
  - B taps + on A's review of the same episode → A still `added:1` (same person + episode), `people:1`.
  - As B, `my_reach()` returns B's totals, not A's (`{people:0, added:0}`).
  - As `anon`: `select public.my_reach()` throws. As `authenticated`: `select * from public.influences` and
    `select * from public.insights_influence` throw (permission denied).
  - `insights_influence` (as the owner role): A's row has `listened 0`; after B logs the episode (insert `logs` with a
    later `created_at`), A's `listened` is `1`.
  - Exit code 1 if any check failed.

- [ ] **Step 2: Run it to see it fail**

Run: `node scripts/check-influence.mjs`
Expected: error that `public.influences` / `my_reach` doesn't exist.

- [ ] **Step 3: Write the migration** (`20261125120000_influences.sql`) with the table, trigger functions and triggers,
  `my_reach()` and the view per the Interfaces above. Header comment in plain words, like the other migrations (what,
  why, Erin 2026-11-24, link to the spec). Backfill comes in Task 2.

- [ ] **Step 4: Run the checks**

Run: `node scripts/check-influence.mjs && npm run db:check`
Expected: every line `ok`, then `25 migration(s) applied cleanly.`

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261125120000_influences.sql scripts/check-influence.mjs
git commit -m "Your reach: record who influenced whom, my_reach() and the team view"
```

### Task 2: Backfill, rehearsed on a copy of live

**Files:**
- Modify: `supabase/migrations/20261125120000_influences.sql` (append the backfill; the migration isn't on any database
  yet)
- Modify: `scripts/check-influence.mjs`
- Create: `scripts/checks/influences.sql`

**Interfaces:**
- Consumes: `public.influences` from Task 1.
- Backfill: every `reactions` row with `kind = 'adding'` and `user_id <> log_user_id` → `'review'` row dated with the
  reaction's `created_at`; every `recommendations` row whose `to_id` has a `logs` row for its `episode_ref` →
  `'send'` row dated with the send's `created_at`. Both `on conflict do nothing`.

- [ ] **Step 1: Add backfill checks to `scripts/check-influence.mjs`**: before applying the new migration, insert a +
  reaction (B on A), a logged send (C → B, B has a log), and a send that was never logged (A → C). Apply migrations in
  two passes (all but `20261125120000_influences.sql`, seed, then that one). Assert C has the `'send'` row, A has the
  `'review'` row, and the unlogged send produced nothing.

- [ ] **Step 2: Run it to see the new checks fail**

Run: `node scripts/check-influence.mjs`
Expected: FAIL on the three backfill lines.

- [ ] **Step 3: Append the backfill** to the migration.

- [ ] **Step 4: Run the checks**

Run: `node scripts/check-influence.mjs && npm run db:check`
Expected: all `ok`; migrations apply cleanly.

- [ ] **Step 5: Rehearse on a copy of live.** Write `scripts/checks/influences.sql` (style of `scripts/checks/decision6.sql`):
  the number of `'review'` rows equals the count of other-person `adding` reactions; no row has `influencer_id =
  user_id`; `my_reach()` as the person with the most `'review'` rows returns `people >= 1`. Ask Erin to export live
  (`scripts/export-live.sql`, saved outside the repo), then run
  `node scripts/rehearse-migrations.mjs <export.json> 20261124190000 scripts/checks/influences.sql` (use the newest
  migration on live if #151 has landed). Expected: checks pass. Also run it without the new migration and confirm the
  checks fail.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261125120000_influences.sql scripts/check-influence.mjs scripts/checks/influences.sql
git commit -m "Your reach: count past + taps and logged sends"
```

### Task 3: "Your reach" on your own profile

**Files:**
- Create: `lib/my-reach.js`
- Create: `components/YourReach.js`
- Modify: `app/u/[handle]/page.js` (after the `<header className="me">…</header>`, before the FollowButton row)
- Modify: `app/globals.css` (new `reach-` classes)
- Modify: `CLAUDE.md` (a "Your reach" line under "Where things are", and `influences` in the tables list)

**Interfaces:**
- Consumes: `public.my_reach()` from Task 1.
- Produces: `useMyReach(userId: string | null) → undefined (loading) | null (no database / error) | { people: number,
  added: number }` in `lib/my-reach.js`, modelled on `useMyListening` in `lib/my-listening.js` (asks once per user, keeps
  the answer a few minutes).
- Produces: `export default function YourReach({ ownerId })` in `components/YourReach.js` (`"use client"`): reads
  `useStore().user`; if not signed in or `user.id !== ownerId`, returns `null` **without calling** `useMyReach` with an
  id (pass `null`); while loading or on `null`, renders nothing.

- [ ] **Step 1: Implement `lib/my-reach.js`** (`db.rpc("my_reach")`; `null` when there's no database client or an error).

- [ ] **Step 2: Implement `components/YourReach.js`** with this copy:
  - Label (mono, like Wrapped's section labels): `Your reach` and, smaller and muted, `only you can see this`.
  - With numbers: `{people} people want to listen because of you` / `1 person wants to listen because of you`;
    `{added} episodes added to Up next because of you` / `1 episode added to Up next because of you`. Numbers in Bagel
    Fat One, cobalt.
  - Both zero: one line, `When someone adds an episode because of your review or send, it shows up here.`
  - Sticker box: 3px ink outline, `4px 4px 0 var(--ink)` shadow, rounded corners; classes `reach`, `reach__row`,
    `reach__n`, `reach__empty` (check with `grep -rn "reach" app components` that none exist).

- [ ] **Step 3: Place it** in `app/u/[handle]/page.js`: `<YourReach ownerId={profile.id} />`.

- [ ] **Step 4: Update CLAUDE.md**: under "Where things are", a **Your reach** bullet (what it counts: + on your review,
  queuing what you sent; `influences` filled by triggers; `my_reach()`; `insights_influence` for the team, with
  "listened"; private; test `node scripts/check-influence.mjs`); add `influences` to the Tables line.

- [ ] **Step 5: Verify against the test database.** Apply the migration to `hooked-test` from a separate linked folder
  (`supabase link --project-ref wxbpizgeauuomagbmwja --workdir <folder>`, then `supabase db push --remote --workdir
  <folder>`; check the Target line says `hooked-test`). Build with the test URL and publishable key, `next start -p
  3127`, Playwright at 390×844 with two throwaway accounts made by SQL (as in docs/PLAN.md "Testing notes"):
  - A's own profile shows the zero line; B taps + on A's review; A's profile shows `1 person…` / `1 episode…`.
  - B viewing A's profile, and a signed-out visitor: no reach section, and no `my_reach` request in the network log.
  - No page errors. Screenshot A's profile. Delete the throwaway accounts afterwards.

- [ ] **Step 6: Lint, check, build, commit**

Run: `npm run lint && npm run db:check && npm run build`
Expected: 0 errors; migrations apply cleanly; build compiles.

```bash
git add lib/my-reach.js components/YourReach.js "app/u/[handle]/page.js" app/globals.css CLAUDE.md
git commit -m "Your reach on your own profile"
```

### Task 4: Ship

- [ ] **Step 1:** Push the branch, open a PR (plain-language summary for Erin and YY, what to tap on the preview: your
  own profile → "Your reach"; the migration and that Erin pushes it after merge with `supabase db push --remote`,
  checking the Target line says `hooked`; back up live first, since the backfill writes data).
- [ ] **Step 2:** Confirm GitHub's checks and the Vercel preview are green (`gh pr view <n> --json statusCheckRollup`).
- [ ] **Step 3:** Add the PR and the pending live push to "Where we left off" in `docs/PLAN.md` in the same PR.
