// Shown when Podcast Index can't be reached, so the page never just breaks.
export default function KeysNotice({ error }) {
  if (!error) return null;
  if (error === "keys") {
    return (
      <div className="notice">
        <p className="notice__title">Almost there.</p>
        <p>
          Add your Podcast Index keys so real shows and episodes appear. In Vercel, open your project, go to{" "}
          <b>Settings → Environment Variables</b>, add <code>PODCASTINDEX_API_KEY</code> and{" "}
          <code>PODCASTINDEX_API_SECRET</code>, then redeploy.
        </p>
      </div>
    );
  }
  return (
    <div className="notice">
      <p className="notice__title">Podcast Index isn't answering.</p>
      <p>Try again in a minute. If it keeps happening, double-check your two keys in Vercel.</p>
    </div>
  );
}
