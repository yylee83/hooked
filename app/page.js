import Link from "next/link";
import Wordmark from "@/components/Wordmark";
import KeysNotice from "@/components/KeysNotice";
import { AvatarLink } from "@/components/Account";
import { FriendsFeed } from "@/components/Friends";
import UpNextHome from "@/components/UpNextHome";
import NewEpisodes from "@/components/NewEpisodes";
import ListeningOnHooked from "@/components/ListeningOnHooked";
import FeaturedDiscussions from "@/components/FeaturedDiscussions";
import TrendingEpisodes from "@/components/TrendingEpisodes";
import { NotificationBell } from "@/components/Notifications";

// Home: what's happening on Hooked. Apple's chart lives on Search.
export default function FriendsPage() {
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

      <KeysNotice />

      {/* The top of Home: the episodes with the most going on lately (Erin, 2026-11-21). */}
      <TrendingEpisodes />

      {/* Up next lives on My log; this slim line leads back there. */}
      <UpNextHome />

      {/* The newest episodes of your hooked shows (signed out: of popular shows), ready to play. */}
      <NewEpisodes />

      {/* Signed out: what people on Hooked are listening to, without names. Signed in: Friends listening now, in the feed. */}
      <ListeningOnHooked />

      <FriendsFeed />

      {/* Trending conversations: reviews and the replies around them, as a list. At the top of Home from 2026-11-20 (YY);
          moved under "From people you follow", and Just logged removed (Erin, 2026-11-21). */}
      <FeaturedDiscussions />
    </>
  );
}
