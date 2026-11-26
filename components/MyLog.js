"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import FinishedNotLogged from "./FinishedNotLogged";
import KeepListening from "./KeepListening";
import { DownloadCount, DownloadsList } from "./Downloads";
import HistoryNote from "./HistoryNote";
import Art from "./Art";
import HookedShows from "./HookedShows";
import { listenedHours, useMyListening } from "@/lib/my-listening";
import PasswordForm from "./PasswordForm";
import { NotificationBell } from "./Notifications";
import { supabase as sb } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { hookedShows, initialsOf, saveProfile, signOut, useStore } from "@/lib/store";
import { Diary, UpNextView } from "./LogViews";
import UpNextCard from "./UpNextCard";
import { myBriefs } from "@/lib/briefs-client";
import { minutes, plural, starStats } from "@/lib/format";
import { showHref } from "@/lib/addresses";

// Notification emails (lib/notify-email.js): follows, replies, sends, thumbs up and + on your reviews.
function NotifyEmailToggle({ state }) {
  const [on, setOn] = useState(state.profile?.email_notify !== false);
  const [busy, setBusy] = useState(false);
  async function flip() {
    setBusy(true);
    const next = !on;
    setOn(next);
    const { error } = await sb().from("profiles").update({ email_notify: next }).eq("id", state.user.id);
    if (error) setOn(!next);
    setBusy(false);
  }
  return (
    <label className="digest">
      <input type="checkbox" checked={on} onChange={flip} disabled={busy} />
      <span>Email me when someone follows me, replies or sends me an episode</span>
    </label>
  );
}

// Weekly email: a Sunday roundup of what friends logged and sent you.
function DigestToggle({ state }) {
  const [on, setOn] = useState(state.profile?.email_digest !== false);
  const [busy, setBusy] = useState(false);
  async function flip() {
    setBusy(true);
    const next = !on;
    setOn(next);
    const { error } = await sb().from("profiles").update({ email_digest: next }).eq("id", state.user.id);
    if (error) setOn(!next);
    setBusy(false);
  }
  return (
    <label className="digest">
      <input type="checkbox" checked={on} onChange={flip} disabled={busy} />
      <span>Weekly email: what friends logged and sent you</span>
    </label>
  );
}

// Log out, at the bottom of settings (the gear on My log). YY, 2026-11-21: there was no clear way to log out.
function LogOutButton() {
  const [busy, setBusy] = useState(false);
  return (
    <div className="me-logout">
      <button type="button" className="btn btn--sm" disabled={busy} onClick={() => (setBusy(true), signOut().finally(() => setBusy(false)))}>
        {busy ? "Logging out…" : "Log out"}
      </button>
      <p className="muted small legal-links">
        <Link href="/privacy">Privacy policy</Link> · <Link href="/terms">Terms</Link>
      </p>
    </div>
  );
}

// Sign-in prompt, first-time handle setup, or profile controls.
function ProfilePanel({ state }) {
  const [editing, setEditing] = useState(false);
  const [handle, setHandle] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [pwSaved, setPwSaved] = useState(false);
  const router = useRouter();

  if (!state.accounts) return null;

  if (!state.user) {
    return (
      <div className="card profile-cta">
        <p className="display h-md" style={{ margin: 0 }}>Make it yours.</p>
        <p style={{ margin: "8px 0 16px" }}>
          Your log is only saved on this device. Make a profile to keep it, share it, and make lists.
        </p>
        <Link href="/login?mode=signup&next=/me" className="btn btn--cobalt btn--shadow-sm">
          Make a profile
        </Link>
        <Link href="/login?next=/me" className="link-btn small" style={{ marginLeft: 14 }}>
          or sign in
        </Link>
      </div>
    );
  }

  const needsHandle = !state.profile?.handle;
  if (!needsHandle && !editing) {
    return (
      <>
      <div className="row gap center wrap" style={{ marginTop: 14 }}>
        <button
          className="btn btn--sm"
          onClick={() => {
            setHandle(state.profile.handle || "");
            setName(state.profile.display_name || "");
            setEditing(true);
          }}
        >
          Edit profile
        </button>
        <Link href={`/u/${state.profile.handle}`} className="btn btn--sm">
          View public profile
        </Link>
        <Link href="/people" className="btn btn--sm">
          Find friends
        </Link>
        <button className="btn btn--sm" onClick={() => (setPwOpen(!pwOpen), setPwSaved(false))} aria-expanded={pwOpen}>
          {pwSaved ? "Password saved ✓" : "Set password"}
        </button>
      </div>
      <NotifyEmailToggle state={state} />
      <DigestToggle state={state} />
      <HistoryNote style={{ marginTop: 10 }} />
      <LogOutButton />
      {pwOpen && (
        <div className="card" style={{ marginTop: 16 }}>
          <p className="label" style={{ marginTop: 0 }}>Set a password</p>
          <p className="muted small" style={{ marginBottom: 10 }}>So you can sign in with your email and password, no link needed.</p>
          <PasswordForm onDone={() => (setPwOpen(false), setPwSaved(true))} />
        </div>
      )}
      </>
    );
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await saveProfile({ handle, displayName: name });
      setEditing(false);
      // A brand-new account: next, follow a few people.
      if (needsHandle) router.push("/welcome/people");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={submit} style={{ marginTop: 22 }}>
      <p className="display h-md" style={{ margin: 0 }}>{needsHandle ? "Pick your handle." : "Edit profile"}</p>
      {needsHandle && <p className="muted">It's how friends find you, like @maya.k.</p>}
      <input className="input" placeholder="handle" value={handle} onChange={(e) => setHandle(e.target.value)} autoCapitalize="none" required />
      <input className="input" placeholder="Your name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
      {error && <p className="nudge">{error}</p>}
      <div className="row gap">
        <button className="btn btn--cobalt btn--shadow-sm" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
        {!needsHandle && (
          <button type="button" className="btn" onClick={() => setEditing(false)}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

// Briefs you've made: drafts first (they open in the builder), then published ones.
function MyBriefs({ userId }) {
  const [briefs, setBriefs] = useState(null);
  useEffect(() => {
    let live = true;
    myBriefs(userId).then(
      (data) => live && setBriefs(data),
      () => live && setBriefs([])
    );
    return () => {
      live = false;
    };
  }, [userId]);
  if (!briefs?.length) return null;
  return (
    <section>
      <h2 className="label">My lists</h2>
      <div className="row gap wrap">
        {briefs.map((b) => (
          <Link key={b.id} href={b.draft ? `/lists/b/${b.id}/edit` : `/lists/b/${b.id}`} className={`brief-chip tone-${b.color}`}>
            <span className="display">{b.title}</span>
            <span className="mono small">
              {b.draft ? "Draft · " : ""}
              {plural(b.items.length, "show")}{b.total_seconds ? ` · ${minutes(b.total_seconds)}` : ""}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

const TABS = [
  ["diary", "Episodes"], // was "Diary"; the address stays #diary so old links work
  ["shows", "Shows"], // back as a tab, after Episodes (YY, 2026-11-26); Wrapped is its own page, /me/wrapped
  ["upnext", "Up next"],
  ["downloads", "Downloads"], // its own tab so it's easy to find (YY, 2026-11-25); always last (YY, 2026-11-26)
];

function useTab() {
  const [tab, setTab] = useState("diary");
  useEffect(() => {
    const h = window.location.hash.slice(1);
    // Old links to the Wrapped tab
    if (h === "stats") return void window.location.replace("/me/wrapped");
    if (TABS.some(([k]) => k === h)) setTab(h);
  }, []);
  return [
    tab,
    (k) => {
      setTab(k);
      try {
        window.history.replaceState(null, "", `#${k}`);
      } catch {}
    },
  ];
}

// The Wrapped card under the stats: confetti, a question, and one real fact from your listening as a teaser.
function WrappedTeaser({ logs, hours, listening }) {
  // Your top show: most played here, else most logged.
  let top = listening?.seconds >= 600 ? listening.shows?.[0]?.title : null;
  if (!top) {
    const n = {};
    for (const l of logs) if (l.feedTitle) n[l.feedTitle] = (n[l.feedTitle] || 0) + 1;
    top = Object.entries(n).sort((a, b) => b[1] - a[1])[0]?.[0];
  }
  const peek = [top && `Top show: ${top}`, hours > 0 && `${hours} hrs listened`].filter(Boolean).join(" · ");
  return (
    <Link href="/me/wrapped" className="me-wrapped">
      <span className="me-wrapped__confetti" aria-hidden="true" />
      <span className="me-wrapped__body">
        <span className="me-wrapped__kicker mono">✦ Your Wrapped</span>
        <span className="me-wrapped__title">What does your listening say about you?</span>
        {peek && <span className="me-wrapped__peek">{peek}</span>}
      </span>
      <span className="me-wrapped__go" aria-hidden="true">→</span>
    </Link>
  );
}

export default function MyLog() {
  const state = useStore();
  const [tab, setTab] = useTab();
  const [settings, setSettings] = useState(false);
  const listening = useMyListening(state?.user?.id || null);
  if (!state) return <div className="loading" aria-label="Loading" />;

  const shows = hookedShows(state);
  const logs = state.logs;
  const showCount = new Set(logs.map((l) => l.feedId || l.feedTitle)).size;
  const stars = starStats(logs);
  // Hours actually played in Hooked's player (YY, 2026-11-20), not the length of what you logged.
  const hours = listening?.seconds >= 360 ? listenedHours(listening.seconds) : 0;
  const queue = state.list.length;
  const needsSetup = !state.user || !state.profile?.handle;
  // From the "shows" count or "All your shows": open the Shows tab and bring it into view.
  const openShows = () => {
    setTab("shows");
    requestAnimationFrame(() => document.querySelector(".me-sections")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  return (
    <>
      {/* "My log" and its buttons share the top row, like the other pages' headers, so the buttons never sit on
          the title (YY, 2026-11-21). */}
      <div className="me-top">
        <h1 className="display me__title">My log</h1>
        <div className="me__bell">
          {state.user && state.profile?.handle && (
            <button className={`icon-btn ${settings ? "is-on" : ""}`} onClick={() => setSettings(!settings)} aria-label="Settings" aria-expanded={settings}>
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          )}
          <NotificationBell />
        </div>
      </div>
      <header className="me">
        <div className="avatar avatar--lg" aria-hidden={!state.user}>
          {state.user ? (
            initialsOf(state.profile)
          ) : (
            <svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <circle cx="12" cy="8.5" r="4" />
              <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
            </svg>
          )}
        </div>
        <div className="min0">
          {state.profile?.handle && (
            <p className="me__handle">
              <Link href={`/u/${state.profile.handle}`}>@{state.profile.handle}</Link>
            </p>
          )}
          {state.user && (
            <p className="me__people small">
              <Link href="/people?tab=following"><b>{state.following?.length || 0}</b> following</Link>
              <span aria-hidden="true"> · </span>
              <Link href="/people?tab=followers"><b>{state.followerCount || 0}</b> {state.followerCount === 1 ? "follower" : "followers"}</Link>
            </p>
          )}
        </div>
      </header>

      {(logs.length > 0 || hours > 0) && (
        <div className="me-stats">
          <span><b>{logs.length}</b> episodes</span>
          <button type="button" onClick={openShows}><b>{showCount}</b> shows</button>
          {stars.count > 0 && <span><b>★ {stars.avg}</b> avg</span>}
          <span><b>{shows.length}</b> hooked</span>
          {hours > 0 && <span><b>{hours}</b> hrs listened</span>}
        </div>
      )}

      {/* Wrapped left the tabs for Shows (YY, 2026-11-26): a festive card near the top, with a sneak peek, opens it. */}
      {(logs.length > 0 || hours > 0) && <WrappedTeaser logs={logs} hours={hours} listening={listening} />}

      {state.error && <div className="notice"><p>{state.error}</p></div>}
      {(needsSetup || settings) && <ProfilePanel state={state} />}
      {state.user && <MyBriefs userId={state.user.id} />}

      {shows.length > 0 && (
        <section>
          <h2 className="label">Hooked on</h2>
          <div className="hooked-on">
            {shows.slice(0, 4).map((s, i) => (
              <Link key={s.showRef || s.feedId} href={showHref(s.showRef, s.feedId)}>
                <Art src={s.image} title={s.title} size="100%" tilt={[-2, 1.5, -1, 2][i]} radius={18} className="art--fluid" />
              </Link>
            ))}
          </div>
          <p className="muted">
            {shows.slice(0, 4).map((s) => s.title).join(" · ")}
            <button type="button" className="link-btn small" style={{ marginLeft: 8 }} onClick={openShows}>
              {shows.length > 4 ? `+${shows.length - 4} more` : "All your shows"}
            </button>
          </p>
        </section>
      )}

      {/* Your Up next queue (moved here from Home, YY 2026-11-20), where "Listening now" used to be: the player already
          has its own Log it button. */}
      {tab !== "upnext" && <UpNextCard onSeeAll={() => setTab("upnext")} />}

      {/* Sections, drawn like browser tabs sitting on a line, so they don't look like the filter pills inside them
          (YY, 2026-11-21). */}
      <div className="me-sections" role="tablist">
        {TABS.map(([k, label]) => (
          <button key={k} className={`me-sections__tab ${tab === k ? "is-on" : ""}`} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {label}
            {k === "upnext" && queue > 0 && <span className="me-sections__n">{queue}</span>}
            {k === "downloads" && <DownloadCount />}
          </button>
        ))}
      </div>

      {tab === "diary" && <FinishedNotLogged />}

      {tab === "upnext" && <KeepListening />}

      {tab === "upnext" ? (
        <UpNextView state={state} />
      ) : tab === "downloads" ? (
        <DownloadsList />
      ) : tab === "shows" ? (
        <HookedShows inTab />
      ) : logs.length === 0 ? (
        <section className="empty card" style={{ marginTop: 16 }}>
          <p className="display h-md">Nothing logged yet.</p>
          <p className="muted">Find an episode, hit play, then rate it and say what you thought.</p>
          <Link className="btn btn--cobalt btn--shadow-sm" href="/search">
            Find something
          </Link>
        </section>
      ) : (
        <Diary logs={logs} />
      )}
    </>
  );
}
