# Hooked

Working on this with Claude or another AI? Start with `CLAUDE.md`.

Find what hooks you. A social podcast log, built with Next.js and the Podcast Index API.

## What's here

- **Home**: your Up next queue, what people you follow are listening to, episodes they sent you, and their latest logs.
- **Find friends** (`/people`): search by name or @handle, follow, invite.
- **Profiles** (`/u/handle`): anyone's public log and the shows they're hooked on. Wrapped stays private.
- **Sharing**: send an episode to friends in-app, or share a no-login link (`/episode/ID?from=handle`) with your review and a custom preview image.
- **Conversations**: reactions (same, ooh, adding it, hard disagree) and replies on any log, including on shared links.
- **Notifications**: a bell for follows, sends, replies and reactions, plus an opt-in weekly email (`/api/cron/digest`, Sundays).
- **Briefs**: a topic, the best episodes from several shows, and each show's angle.
- **Search**: live search of about 4 million podcasts.
- **Show pages**: details plus the latest episodes, with Play and Log it.
- **Log it** (or paste an Apple Podcasts / Spotify link): hooked or not, a star rating (tap a star twice for a half), and "What's the hook?"
- **My log**: your stats, the shows you're hooked on, and tabs for Diary (searchable, filterable), Shows, Up next and Wrapped.
- **Accounts**: email + password or email-link sign-in. Logs, hooked shows, lists and briefs save to your account.
- **+ button**: log a review, or make a brief.
- **Trending now** (on Search): today's top US searches from Google Trends, with one tap to hear podcasts on it or make a brief.
- **Brief builder**: pick a topic, then whole episodes or just the parts that mention it, played back to back.

Clips only work for shows that publish timed transcripts; other episodes play in full.

## Easy edits

- Site name and tagline: `lib/site.js`
- Briefs: `lib/briefs.js` (copy a block to add a new one)
- Colors and styles: `app/globals.css`

## Database

Run `supabase/setup.sql` once in Supabase → SQL Editor (dropdown set to your database, not Logs). It's safe to run again.
Already set up earlier? Run the `supabase/update-*.sql` files you haven't run yet (latest: `update-interests.sql`).

## Keys

Add these four in Vercel → Settings → Environment Variables, then redeploy:

```
PODCASTINDEX_API_KEY
PODCASTINDEX_API_SECRET
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

For the weekly email, also add (server-only, never public):

```
SUPABASE_SERVICE_ROLE_KEY
RESEND_API_KEY
DIGEST_FROM        e.g. Hooked <hello@yourdomain.com>
CRON_SECRET        any long random string
```

The Podcast Index keys stay on the server. The Supabase URL and anon key are meant to be public; the database's security rules protect the data.
