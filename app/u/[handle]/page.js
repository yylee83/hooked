import Link from "next/link";
import { notFound } from "next/navigation";
import Art from "@/components/Art";
import Stars from "@/components/Stars";
import { Avatar, FollowButton } from "@/components/Friends";
import { ShareButton } from "@/components/Share";
import LogThread from "@/components/LogThread";
import { getProfilePage } from "@/lib/supabase/public";
import { minutes, plural } from "@/lib/format";
import { site } from "@/lib/site";

export const revalidate = 30;

export async function generateMetadata({ params }) {
  const { handle } = await params;
  const page = await getProfilePage(handle);
  if (!page) return { title: "Profile" };
  const name = page.profile.display_name || `@${page.profile.handle}`;
  return {
    title: `${name} (@${page.profile.handle})`,
    description: `See what ${name} is hooked on: ${plural(page.logs.length, "episode")} logged on ${site.name}.`,
    openGraph: { title: `${name} on ${site.name}`, description: `See what ${name} is hooked on.` },
  };
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// A person's public page: who they are, what they're hooked on, and their log. (Wrapped stays private.)
export default async function ProfilePage({ params }) {
  const { handle } = await params;
  const page = await getProfilePage(handle);
  if (!page) notFound();
  const { profile, logs, shows, briefs, followers, following } = page;
  const hookedCount = logs.filter((l) => l.hooked).length;

  const groups = [];
  for (const l of logs) {
    const d = new Date(l.logged_at);
    const label = d.getFullYear() === new Date().getFullYear() ? MONTHS[d.getMonth()] : `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(l);
    else groups.push({ label, items: [l] });
  }

  return (
    <>
      <header className="me">
        <Avatar person={profile} size={88} />
        <div className="min0">
          <h1 className="display profile__name">{profile.display_name || `@${profile.handle}`}</h1>
          {profile.display_name && <p className="me__handle">@{profile.handle}</p>}
          <p className="mono me__stats">
            {plural(logs.length, "episode")} · {hookedCount} hooked
          </p>
          <p className="mono me__stats">
            {plural(followers, "follower")} · {following} following
          </p>
        </div>
      </header>
      <div className="row gap center" style={{ marginTop: 16 }}>
        <FollowButton person={profile} />
      </div>

      {shows.length > 0 && (
        <section>
          <h2 className="label">Hooked on</h2>
          <div className="hooked-on">
            {shows.slice(0, 4).map((s, i) => (
              <Link key={s.feed_id} href={`/show/${s.feed_id}`}>
                <Art src={s.image} title={s.title || ""} size="100%" tilt={[-2, 1.5, -1, 2][i]} radius={18} className="art--fluid" />
              </Link>
            ))}
          </div>
          <p className="muted">{shows.slice(0, 4).map((s) => s.title).join(" · ")}</p>
        </section>
      )}

      {briefs.length > 0 && (
        <section>
          <h2 className="label">Briefs</h2>
          <div className="row gap wrap">
            {briefs.map((b) => (
              <Link key={b.id} href={`/briefs/b/${b.id}`} className={`brief-chip tone-${b.color}`}>
                <span className="display">{b.title}</span>
                <span className="mono small">
                  {b.items.length} shows{b.total_seconds ? ` · ${minutes(b.total_seconds)}` : ""}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {logs.length === 0 ? (
        <p className="muted" style={{ marginTop: 30 }}>
          Nothing logged yet.
        </p>
      ) : (
        groups.map((g) => (
          <section key={g.label}>
            <h2 className="label">{g.label}</h2>
            <ul className="log">
              {g.items.map((l) => (
                <li key={l.episode_id} className="log__row log__row--share">
                  <span className="mono log__day">{new Date(l.logged_at).getDate()}</span>
                  <Art src={l.image} title={l.feed_title || ""} size={56} radius={12} episodeId={l.episode_id} />
                  <div className="min0">
                    <Link href={`/episode/${l.episode_id}?from=${profile.handle}`} className="title-sm" style={{ display: "block" }}>
                      {l.title}
                    </Link>
                    <p className="muted small row gap-xs center wrap">
                      {l.feed_title}
                      {l.rating > 0 && (
                        <>
                          <span>·</span>
                          <Stars value={Number(l.rating)} size={15} />
                        </>
                      )}
                    </p>
                    {l.hook && <p className="log__hook">“{l.hook}”</p>}
                    <LogThread logUserId={profile.id} episodeId={l.episode_id} />
                  </div>
                  <div className="log__side">
                    <span className={`sticker ${l.hooked ? "" : "sticker--outline"}`}>{l.hooked ? "Hooked" : "Not hooked"}</span>
                    <ShareButton
                      compact
                      episode={{ id: l.episode_id, title: l.title, feedId: l.feed_id, feedTitle: l.feed_title, image: l.image, audio: l.audio, duration: l.duration }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
