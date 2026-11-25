"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Art from "./Art";
import { Avatar } from "./Friends";
import { useStore } from "@/lib/store";
import { useRefreshTick } from "@/lib/home-refresh";
import { episodeHref } from "@/lib/addresses";
import { fetchNotifications, markAllRead, timeAgo, REACTION_WORDS } from "@/lib/social";
import { useUnread, badgeText } from "@/lib/unread";

// The bell, with a pink count of unread notifications.
export function NotificationBell() {
  const state = useStore();
  const path = usePathname();
  const tick = useRefreshTick();
  const uid = state?.user?.id;
  const { count } = useUnread(uid, `${path}|${tick}`);

  if (!uid) return null;
  return (
    <Link href="/notifications" className="bell" aria-label={count ? `Notifications, ${count} new` : "Notifications"}>
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9z" />
        <path d="M10 20a2.2 2.2 0 0 0 4 0" />
      </svg>
      {count > 0 && <span className="bell__n">{badgeText(count)}</span>}
    </Link>
  );
}

const TOASTED = "hooked:note-toast";

// On opening Hooked or signing in (and when one arrives while you're here), a small note says what's new, once per
// notification: "@ana followed you", or "and 2 more". Tap to open them; it tucks away by itself after a few seconds.
export function NotificationToast() {
  const state = useStore();
  const path = usePathname() || "/";
  const uid = state?.user?.id;
  const { count, newest } = useUnread(uid, path);
  const [shown, setShown] = useState(null);

  useEffect(() => {
    if (!uid || !newest || path.startsWith("/notifications") || path.startsWith("/log/")) return;
    const mark = `${uid}:${newest.id}`;
    let seen = null;
    try {
      seen = localStorage.getItem(TOASTED);
    } catch {}
    if (seen === mark) return;
    try {
      localStorage.setItem(TOASTED, mark);
    } catch {}
    setShown({ note: newest, count });
  }, [uid, newest, count, path]);

  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setShown(null), 7000);
    return () => clearTimeout(t);
  }, [shown]);

  useEffect(() => {
    if (path.startsWith("/notifications")) setShown(null);
  }, [path]);

  if (!shown || !uid) return null;
  const d = describe(shown.note, state.profile?.handle);
  const more = shown.count - 1;
  return (
    <div className="note-toast" role="status">
      <Link href="/notifications" className="note-toast__body" onClick={() => setShown(null)}>
        <span className="note-toast__n">{badgeText(shown.count)}</span>
        <span className="note-toast__text">
          {d.text}
          {more > 0 && <span className="note-toast__more"> and {more} more</span>}
        </span>
      </Link>
      <button className="note-toast__x" aria-label="Dismiss" onClick={() => setShown(null)}>
        ×
      </button>
    </div>
  );
}

function describe(n, myHandle) {
  const who = n.actor?.handle ? `@${n.actor.handle}` : "Someone";
  const ep = n.title ? `“${n.title}”` : "an episode";
  const page = episodeHref(n.episode_ref, n.episode_id);
  const thread = (owner) => `${page}?from=${encodeURIComponent(owner || myHandle || "")}#thread`;
  switch (n.type) {
    case "follow":
      return { text: <><b>{who}</b> followed you</>, href: `/u/${n.actor?.handle || ""}` };
    case "rec":
      return { text: <><b>{who}</b> sent you {ep}</>, quote: n.body, href: `${page}?from=${encodeURIComponent(n.actor?.handle || "")}` };
    case "comment":
      return { text: <><b>{who}</b> replied to your log of {ep}</>, quote: n.body, href: thread(myHandle) };
    case "reply":
      return { text: <><b>{who}</b> also replied on @{n.owner?.handle}'s log of {ep}</>, quote: n.body, href: thread(n.owner?.handle) };
    case "reaction":
      return { text: <><b>{who}</b> reacted “{REACTION_WORDS[n.body] || n.body}” to your log of {ep}</>, href: thread(myHandle) };
    case "story":
      return { text: <>New on <b>{n.body}</b>, a story you follow: {ep}</>, href: page };
    default:
      return { text: <><b>{who}</b></>, href: "/" };
  }
}

export function NotificationList() {
  const state = useStore();
  const [items, setItems] = useState(null);
  const uid = state?.user?.id;

  useEffect(() => {
    if (!uid) return;
    let live = true;
    fetchNotifications(uid).then((list) => {
      if (!live) return;
      setItems(list);
      if (list.some((n) => !n.read_at)) markAllRead(uid);
    });
    return () => {
      live = false;
    };
  }, [uid]);

  if (!state) return <div className="loading" />;
  if (!state.user) {
    return (
      <p className="muted">
        <Link href="/login?next=/notifications" className="u-link">
          Sign in
        </Link>{" "}
        to see your notifications.
      </p>
    );
  }
  if (!items) return <div className="loading" />;
  if (!items.length) {
    return (
      <div className="card friends-cta">
        <p className="display h-md" style={{ margin: 0 }}>All quiet.</p>
        <p style={{ margin: "8px 0 16px" }}>When friends follow you, send you episodes, or reply to your logs, it shows up here.</p>
        <Link href="/people" className="btn btn--cobalt btn--shadow-sm">
          Find friends
        </Link>
      </div>
    );
  }

  return (
    <ul className="notes">
      {items.map((n) => {
        const d = describe(n, state.profile?.handle);
        return (
          <li key={n.id}>
            <Link href={d.href} className={`note ${n.read_at ? "" : "is-new"}`}>
              <Avatar person={n.actor || {}} size={42} />
              <span className="min0 grow">
                <span className="note__text">{d.text}</span>
                {d.quote && <span className="note__quote">“{d.quote}”</span>}
                <span className="note__time mono">{timeAgo(n.created_at)}</span>
              </span>
              {!n.read_at && <span className="note__dot" aria-label="New" />}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
