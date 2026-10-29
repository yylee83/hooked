# Hooked

Find what hooks you. A social podcast log, built with Next.js and the Podcast Index API.

## What's here

- **Friends**: listening now, friends' recommendations with reactions, and live trending shows.
- **Briefs**: a topic, the best episodes from several shows, and each show's angle.
- **Search**: live search of about 4 million podcasts.
- **Show pages**: details plus the latest episodes, with Play and Log it.
- **Log it**: hooked or not, a star rating (tap a star twice for a half), and "What's the hook?"
- **My log**: your stats, the shows you're hooked on, your list, and your log by month.

Friends are sample data for now (see `lib/demo.js`). Your log saves in your browser until accounts are added.

## Easy edits

- Your initials and handle: `lib/site.js`
- Briefs: `lib/briefs.js` (copy a block to add a new one)
- Sample friends: `lib/demo.js`
- Colors and styles: `app/globals.css`

## Keys

Add these two in Vercel → Settings → Environment Variables, then redeploy:

```
PODCASTINDEX_API_KEY
PODCASTINDEX_API_SECRET
```

They're only used on the server and never sent to the browser.
