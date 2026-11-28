# Show pages: sort and hide logged — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Newest | Oldest and "Hide logged" on show pages.
**Architecture:** server reads `?sort`; a small client component hides logged rows.
**Tech Stack:** Next.js 16 App Router, React 19, plain JS, `app/globals.css`.
**Spec:** `docs/superpowers/specs/2026-11-27-show-episode-sort-design.md`

## Global Constraints
- Unique class names prefixed `show-eps`; 390px first; short warm copy.
- External calls unchanged (Podcast Index via `getEpisodes`, our own via `ownShowEpisodes`).
- Lint, `npm run db:check`, build before pushing. Test against the test database only.

## Review Focus
1. A show with no episodes or a Podcast Index error: page still renders, controls don't break (Task 1).
2. Oldest + Load more: second page continues from where the first stopped (Task 1).
3. Signed out: no Hide logged toggle (Task 2).
4. Every row logged with Hide logged on: the list says so instead of looking empty (Task 2).
5. A show with fewer than 30 episodes in Oldest: no Load more (Task 1).

---

### Task 1: Sort on the server
**Files:** Modify `app/show/[id]/page.js`; CSS in `app/globals.css`.
- [ ] Write a local Playwright check (scratchpad `sort.mjs`): on a test-database show, Oldest lists dates ascending and
      differs from Newest; Load more in Oldest keeps `sort=oldest` and appends later dates; a short show has no Load more.
- [ ] Run it: fails (no switch).
- [ ] Implement `sort` (`newest` | `oldest`), fetch `MOST` and reverse for oldest, links that replace the address, heading
      "Episodes", the 1,000 note.
- [ ] Run it: passes. Commit.

### Task 2: Hide logged
**Files:** Create `components/ShowEpisodes.js` (`useHideLogged()`, `HideLoggedControl({ episodes })`,
`ShowEpisodeRow({ episode, children })`); modify the page and CSS; CLAUDE.md line under "Where things are".
- [ ] Extend the check: signed out, no toggle; signed in with one logged episode on the page, toggling hides that row and
      shows "1 logged episode hidden · Show"; reload keeps it on; all rows logged shows the hidden line, not an empty list.
- [ ] Run it: fails. Implement. Run it: passes. Lint, db:check, build. Commit, push, PR with what to tap on the preview.
