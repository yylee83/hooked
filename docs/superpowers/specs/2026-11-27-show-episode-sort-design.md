# Show pages: sort episodes and hide logged ones (design)

Agreed with Erin, 2026-11-27.

## Why
Erin found "In Our Time" and wanted to start from the earliest episodes. Apple's show pages switch between newest and
oldest and can hide played episodes; Hooked's only list newest first, 30 at a time.

## Goals
- A Newest | Oldest switch above a show's episode list.
- "Hide logged" (signed in, only when you've logged an episode of that show): hides those rows, with a line saying how
  many are hidden and a way to show them.

## Non-goals
- Remembering the sort per show (Apple does; not now).
- Hiding played-but-not-logged episodes (listening history is private; the filter is about logs). Downloaded/saved filters.

## Approaches
- **A. Sort in the address, hide-logged on the phone. Chosen (Erin).** `?sort=oldest`: the server fetches the full list
  once (Podcast Index's limit, 1,000), flips it, and pages 30 at a time as today; Back, sharing and reload keep it. Hiding
  logged rows happens in the browser from the person's own logs (server pages read without a sign-in).
- B. Move the episode list into a client component that fetches and filters itself. Rejected: bigger rewrite, list no
  longer arrives with the page; only better when many rows are hidden.

## Design
- `app/show/[id]/page.js`: `sort` is `newest` (default) or `oldest`. Oldest: fetch up to 1,000 (Podcast Index, or our own
  episodes for shows read from their feed), reverse, take `max`. "Load more" keeps `sort`. The heading reads "Episodes".
- Switch: two links (`?sort=` cleared for newest), the active one filled cobalt; they replace the page's address in
  place so Back doesn't step through each toggle (Claude's call).
- Hide logged: `components/ShowEpisodes.js` (client). A toggle remembered on the device for all shows
  (`hooked:hide-logged`); each row hides itself when on and logged; a line "N logged episodes hidden · Show". Shown only
  signed in and when at least one listed episode is logged.
- More than 1,000 episodes, in Oldest: one small line, "Starts at the oldest of the 1,000 most recent episodes."
- Classes prefixed `show-eps`. Mobile first (390px).

## Left to the builder
Exact markup and styling within Hooked's sticker look.
