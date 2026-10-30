"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Art from "./Art";
import { Avatar } from "./Friends";
import { useStore } from "@/lib/store";
import { fetchNotifications, markAllRead, timeAgo, unreadCount, REACTION_WORDS } from "@/lib/social";

// The bell, with a count of unread notifications. Checks every minute while the tab is open.
export function NotificationBell() {
  const state = useStore();
  const path = usePathname();
  const [count, setCount] = useState(0);
  const uid = state?.user?.id;

  useEffect(() => {
    if (!uid) return;
    let live = true;
    const check = () => document.visibilityState === "visible" && unreadCount(uid).then((n) => live && setCount(n));
    check();
    const t = setInterval(check, 60000);
    const onRead = () => setCount(0);
    window.addEventListener("hooked-notes-read", onRead);
    document.addEventListener("visibilitychange", check);
    return () => {
      live = false;
      clearInterval(t);
      window.removeEventListener("hooked-notes-read", onRead);
      document.removeEventListener("visibilitychange", check);
    };
  }, [uid, path]);

  if (!uid) return null;
  return (
    <Link href="/notifications" className="bell" aria-label={count ? `Notifications, ${count} new` : "Notifications"}>
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9z" />
        <path d="M10 20a2.2 2.2 0 0 0 4 0" />
      </svg>
      {count > 0 && <span className="bell__n">{count > 9 ? "9+" : count}</span>}
    </Link>
  );
}


function describe(n, myHandle) {
  const who = n.actor?.handle ? `@${n.actor.handle}` : "Someone";
  const ep = n.title ? `“${n.title}”` : "an episode";
  const thread = (owner) => `/episode/${n.episode_id}?from=${encodeURIComponent(owner || myHandle || "")}#thread`;
  switch (n.type) {
    case "follow":
      return { text: <><b>{who}</b> followed you</>, href: `/u/${n.actor?.handle || ""}` };
    case "rec":
      return { text: <><b>{who}</b> sent you {ep}</>, quote: n.body, href: `/episode/${n.episode_id}?from=${encodeURIComponent(n.actor?.handle || "")}` };
    case "comment":
      return { text: <><b>{who}</b> replied to your log of {ep}</>, quote: n.body, href: thread(myHandle) };
    case "reply":
      return { text: <><b>{who}</b> also replied on @{n.owner?.handle}'s log of {ep}</>, quote: n.body, href: thread(n.owner?.handle) };
    case "reaction":
      return { text: <><b>{who}</b> reacted “{REACTION_WORDS[n.body] || n.body}” to your log of {ep}</>, href: thread(myHandle) };
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
