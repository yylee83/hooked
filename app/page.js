import Link from "next/link";
import Wordmark from "@/components/Wordmark";
import Art from "@/components/Art";
import KeysNotice from "@/components/KeysNotice";
import { AvatarLink, FreshLogs } from "@/components/Account";
import { FriendsFeed } from "@/components/Friends";
import { NotificationBell } from "@/components/Notifications";
import { artOf, safe, trendingShows } from "@/lib/podcastindex";

// Refresh trending shows every 15 minutes.
export const revalidate = 900;

export default async function FriendsPage() {
  const trending = await safe(trendingShows(9));

  return (
    <>
      <header className="topbar">
        <Wordmark size={34} />
        <div className="row gap center">
          <Link href="/people" className="find-friends" aria-label="Find friends">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <circle cx="9" cy="8" r="4" />
              <path d="M2 21c0-4 3-6.5 7-6.5s7 2.5 7 6.5" />
              <path d="M19 8v6M16 11h6" />
            </svg>
          </Link>
          <NotificationBell />
          <AvatarLink />
        </div>
      </header>

      <KeysNotice error={trending.error} />

      <FriendsFeed />

      <FreshLogs />

      {trending.data?.length > 0 && (
        <>
          <h2 className="section-title">Trending right now</h2>
          <div className="trend">
            {trending.data.map((s, i) => (
              <Link key={s.id} href={`/show/${s.id}`} className="trend__item">
                <Art src={artOf(s)} title={s.title} size="100%" radius={18} tilt={[-1.5, 1, -0.5][i % 3]} className="art--fluid" />
                <p>{s.title}</p>
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  );
}
