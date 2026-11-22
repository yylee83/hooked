// Bottom of an episode page: the briefs this episode is in, with what each brief says about it.
// Built-in briefs first (they have a note per episode), then listeners' published briefs.
import Link from "next/link";
import { featuredBriefsFor } from "@/lib/briefs-server";
import { briefsWithEpisode } from "@/lib/supabase/public";

export default async function FeaturedInBriefs({ episode }) {
  const [featured, listeners] = await Promise.all([
    featuredBriefsFor(episode).catch(() => []),
    briefsWithEpisode(episode.ref).catch(() => []),
  ]);
  const list = [
    ...featured,
    ...listeners.map((b) => ({ key: b.id, href: `/lists/b/${b.id}`, title: b.title, color: b.color, by: b.author?.handle })),
  ];
  if (!list.length) return null;
  return (
    <section className="ep-briefs">
      <h2 className="label">Featured in</h2>
      <div className="ep-briefs__list">
        {list.map((b) => (
          <Link key={b.key} href={b.href} className={`ep-briefs__item ep-briefs__item--${b.color || "cobalt"}`}>
            <span className="ep-briefs__title">{b.title}</span>
            {b.note ? <span className="ep-briefs__note">{b.note}</span> : b.by && <span className="ep-briefs__by">A list by @{b.by}</span>}
          </Link>
        ))}
      </div>
    </section>
  );
}
