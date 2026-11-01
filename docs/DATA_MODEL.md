# Step 7: our own shows and episodes

A design for review by Erin and YY. Nothing here is built yet. The five decisions at the bottom need a
yes, a no or a change from both of you.

## In one paragraph

Today Hooked knows about a podcast only through Podcast Index. Every log, Up next item, send and
brief copies the episode's title, cover and audio address into its own row, and identifies the episode
by Podcast Index's number. If Podcast Index has a broken entry (like The Michelle Collins Show, #223945),
or doesn't have a show at all, Hooked can't help. The fix: Hooked gets its own **shows** and **episodes**
tables. Podcast Index becomes one place we look things up, alongside Apple and the show's own feed.
Everything people do (logs, ratings, reviews, Up next, sends, briefs) points at *our* episode.

## What changes for people using the app

- **Shows Podcast Index lacks can still be logged.** If Apple knows the show's feed, we read the feed
  ourselves and get every episode. If a show is Spotify-only with no public feed, we keep a basic entry
  (title, show, cover, Spotify link) so it can still be logged and reviewed. It just can't play in our
  player.
- **No more dead pages.** A show or episode page loads from our tables first and refreshes from outside
  sources in the background.
- **Faster pages.** Episode and show pages read from our database instead of waiting on Podcast Index.
- **Links keep working.** Old addresses like `/episode/62497006265` redirect to the new ones forever.
- **Room for our own information:** topics, our own descriptions, "Hooked on" counts, editor picks,
  later search.

## The new tables

### `shows`
| Column | What it holds |
|---|---|
| `id` | **Our** id (see decision 1) |
| `title`, `author`, `description`, `image_url`, `website_url`, `language`, `categories` | About the show |
| `feed_url` | The show's own feed (blank for Spotify-only shows) |
| `podcast_guid` | The show's permanent id from its feed, when it has one: the most reliable way to match |
| `podcastindex_id`, `apple_id`, `spotify_id` | The show's numbers elsewhere, so a link from any source finds the same show |
| `source` | Where we first got it: `podcastindex`, `feed`, `spotify` or `legacy` (copied from old logs) |
| `last_fetched_at`, `fetch_error`, `failures` | Keeping it up to date (see "Staying fresh") |
| `search` | Words for our own search (step 8) |

### `episodes`
| Column | What it holds |
|---|---|
| `id` | **Our** id |
| `show_id` | Which show |
| `guid` | The episode's id inside its feed. Unique per show, so re-reading a feed never duplicates |
| `title`, `published_at`, `duration_seconds`, `image_url`, `season`, `episode_number` | About the episode |
| `description_html`, `description_text` | Cleaned before saving (feeds are written by anyone), plus a plain-text copy for search and previews |
| `audio_url`, `episode_url` | For the player and "Listen" links |
| `transcripts` | Transcript addresses, for brief clips |
| `podcastindex_id`, `apple_id`, `spotify_id` | Its numbers elsewhere |
| `source`, `search` | As for shows |

Both tables can be read by anyone. Only the server writes to them (with the service key), so nobody
can plant a fake show.

## What happens to today's tables

| Table | Change |
|---|---|
| `logs` | Points at `episodes.id`. Still **one log per person per episode**. The copied title, cover, audio and show columns go away at the end, since the episode has them. Hooked, rating, "What's the hook?" and the date stay. |
| `list_items` (Up next) | Points at `episodes.id` (or `shows.id` for a whole show). |
| `recommendations` (sends) | Points at `episodes.id`. The note and the sender's take stay. |
| `comments`, `reactions` | Still attached to a log. They follow the log's new episode id. |
| `notifications` | Point at `episodes.id`. The copied title can stay, since a notification is a snapshot. |
| `hooked_shows` | Points at `shows.id`. |
| `briefs` | Each item in a brief points at `episodes.id`. Clip times stay as they are. |
| `profiles`, `follows`, `allowed_emails`, `trending_topics` | No change. |

## How a show or episode gets in

1. **Someone opens, logs or adds an episode** we don't have yet. The server looks it up
   (Podcast Index by its number, Apple by its id, or the feed directly) and saves the show and episode,
   then carries on. This is one server route, "make sure we have this episode," used by every
   screen that needs it.
2. **Pasted links:** Apple → Apple's feed address → our show (read the feed if it's new). Spotify →
   match by title through Apple and Podcast Index as today. If nothing has a public feed, save a basic
   Spotify-only entry.
3. **Search** keeps using Podcast Index and Apple for now. Results are saved only when someone opens
   one, so the tables hold what people actually use. Step 8 adds search over our own tables.

**No duplicates:** before saving a show we check `podcast_guid`, then the feed address, then the
Podcast Index, Apple and Spotify ids. Episodes match on `guid` within their show.

**Reading feeds directly** goes through `safeFetch` (blocks private addresses, caps size and time). It
honors the feed's "not changed since" headers so we don't re-download unchanged feeds.

## Staying fresh

- When a show page is opened and the show hasn't been checked for 6 hours, refresh it in the background.
- Once a day, refresh shows someone is hooked on or has in Up next. Vercel's free plan runs scheduled
  jobs at most once a day, so this is a daily job.
- A feed that keeps failing gets checked less often. After many failures we stop and keep what we have.

## How we switch over safely: four stages

Each stage is its own PR. Each is tried on the test database (previews) first, then the live one.
The live site keeps working the whole time.

| Stage | What happens | Can it be undone? |
|---|---|---|
| **A. Add** | Create `shows` and `episodes`. Add a new episode/show column next to the old one in each table above. Fill everything in from Podcast Index, falling back to the copied details in old logs when Podcast Index fails, so nothing is lost. The app doesn't change yet. | Yes: drop the new tables and columns. |
| **B. Write both** | The app saves new logs, Up next items, sends and briefs with both the old and new ids. Episode and show pages read from our tables, with Podcast Index as backup. | Yes: the old columns are still complete. |
| **C. Switch** | Page addresses use our ids, old addresses redirect, and the app reads only the new columns. Shows from Apple feeds and Spotify-only entries start working. | Yes, until stage D. |
| **D. Tidy** | After **both of you** have checked live for a while: remove the old id columns and copied details. Back up first. | No, which is why it waits. |

**Backup before stages A and D:** a full export of the live data, kept outside the repo. The same
kind of copy filled the test database.

## Decisions for you

1. **Which ids do we use?**
   - **(a) Recommended: our own ids.** Podcast Index's number becomes one stored reference among
     several. If Podcast Index re-numbers or breaks an entry (as with #223945), we update one column and
     every log stays attached. Old links redirect. The cost: page addresses change once.
   - (b) Keep Podcast Index's numbers as our ids, and invent numbers for shows that aren't in Podcast
     Index. There's less to change, but we stay tied to Podcast Index's numbering, which is part of
     what broke.
2. **What do new addresses look like?** Recommended: `/episode/<short id>`, a short random code like
   `/episode/k3x9q2` rather than a long internal id. Readable "slug" addresses
   (`/show/the-daily`) could come later.
3. **Spotify-only shows:** keep basic, log-only entries? Recommended: yes. Otherwise those shows can't
   be logged at all.
4. **Briefs:** keep their items inside the brief, as now, just pointing at our episode ids?
   Recommended: yes, for now. Giving brief items their own table only matters if we want to search
   inside briefs.
5. **Stage D timing:** remove the old columns after both of you have used the live site on stage C for
   about a week with nothing missing. Agree?
