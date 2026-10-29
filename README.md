# Hooked

Find what hooks you. A social podcast log, built with Next.js and the Podcast Index API.

## What's here

- **Friends**: listening now, friends' recommendations with reactions, and live trending shows.
- **Briefs**: a topic, the best episodes from several shows, and each show's angle.
- **Search**: live search of about 4 million podcasts.
- **Show pages**: details plus the latest episodes, with Play and Log it.
- **Log it**: hooked or not, a star rating (tap a star twice for a half), and "What's the hook?"
- **My log**: your stats, the shows you're hooked on, your list, and your log by month.
- **Profiles**: email-link sign-in (no passwords). Logs, hooked shows, lists and briefs save to your account.
- **+ button**: log a review, or make a brief.
- **Trending now**: today's top US searches from Google Trends, with one tap to hear podcasts on it or make a brief.
- **Brief builder**: pick a topic, then whole episodes or just the parts that mention it, played back to back.

"Listening now" and "Recommended to you" friends are still samples (see `lib/demo.js`).
Clips only work for shows that publish timed transcripts; other episodes play in full.

## Easy edits

- Your initials and handle: `lib/site.js`
- Briefs: `lib/briefs.js` (copy a block to add a new one)
- Sample friends: `lib/demo.js`
- Colors and styles: `app/globals.css`

## Database

Run `supabase/setup.sql` once in Supabase → SQL Editor. It's safe to run again.

## Keys

Add these four in Vercel → Settings → Environment Variables, then redeploy:

```
PODCASTINDEX_API_KEY
PODCASTINDEX_API_SECRET
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

The Podcast Index keys stay on the server. The Supabase URL and anon key are meant to be public; the database's security rules protect the data.
