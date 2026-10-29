"use client";
import Link from "next/link";
import Art from "./Art";
import Wrapped from "./Wrapped";
import PasswordForm from "./PasswordForm";
import { NotificationBell } from "./Notifications";
import { supabase as sb } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { hookedShows, initialsOf, saveProfile, signOut, useStore } from "@/lib/store";
import { Diary, ShowsView, UpNextView } from "./LogViews";
import { supabase } from "@/lib/supabase/client";
import { minutes, plural } from "@/lib/format";

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

// Sign-in prompt, first-time handle setup, or profile controls.
function ProfilePanel({ state }) {
  const [editing, setEditing] = useState(false);
  const [handle, setHandle] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [pwSaved, setPwSaved] = useState(false);

  if (!state.accounts) return null;

  if (!state.user) {
    return (
      <div className="card profile-cta">
        <p className="display h-md" style={{ margin: 0 }}>Make it yours.</p>
        <p style={{ margin: "8px 0 16px" }}>
          Your log is only saved on this device. Make a profile to keep it, share it, and make briefs.
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
        <button className="link-btn small" onClick={() => signOut()}>
          Sign out
        </button>
      </div>
      <DigestToggle state={state} />
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

// Briefs you've made.
function MyBriefs({ userId }) {
  const [briefs, setBriefs] = useState(null);
  useEffect(() => {
    let live = true;
    supabase()
      ?.from("briefs")
      .select("id, title, color, mode, total_seconds, items")
      .eq("author_id", userId)
      .order("created_at", { ascending: false })
      .then(({ data }) => live && setBriefs(data || []));
    return () => {
      live = false;
    };
  }, [userId]);
  if (!briefs?.length) return null;
  return (
    <section>
      <h2 className="label">My briefs</h2>
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
  );
}

const TABS = [
  ["diary", "Diary"],
  ["shows", "Shows"],
  ["upnext", "Up next"],
  ["stats", "Wrapped"],
];

function useTab() {
  const [tab, setTab] = useState("diary");
  useEffect(() => {
    const h = window.location.hash.slice(1);
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

export default function MyLog() {
  const state = useStore();
  const [tab, setTab] = useTab();
  const [settings, setSettings] = useState(false);
  if (!state) return <div className="loading" aria-label="Loading" />;

  const shows = hookedShows(state);
  const logs = state.logs;
  const np = state.nowPlaying;
  const nowPlayingLogged = np && logs.some((l) => l.id === np.id);
  const showCount = new Set(logs.map((l) => l.feedId || l.feedTitle)).size;
  const hookedPct = logs.length ? Math.round((logs.filter((l) => l.hooked).length / logs.length) * 100) : 0;
  const hours = Math.round(logs.reduce((a, l) => a + (l.duration || 0), 0) / 3600);
  const queue = state.list.length;
  const needsSetup = !state.user || !state.profile?.handle;

  return (
    <>
      <div className="me__bell">
        {state.user && state.profile?.handle && (
          <button className={`icon-btn ${settings ? "is-on" : ""}`} onClick={() => setSettings(!settings)} aria-label="Settings" aria-expanded={settings}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3.2" />
              <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
            </svg>
          </button>
        )}
        <NotificationBell />
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
          <h1 className="display me__title">My log</h1>
          {state.profile?.handle && (
            <p className="me__handle">
              <Link href={`/u/${state.profile.handle}`}>@{state.profile.handle}</Link>
              <span className="muted small"> · {plural(state.following?.length || 0, "friend")} followed</span>
            </p>
          )}
        </div>
      </header>

      {logs.length > 0 && (
        <div className="me-stats">
          <span><b>{logs.length}</b> episodes</span>
          <span><b>{showCount}</b> shows</span>
          <span><b>{hookedPct}%</b> hooked</span>
          {hours > 0 && <span><b>{hours}</b> hrs</span>}
        </div>
      )}

      {state.error && <div className="notice"><p>{state.error}</p></div>}
      {(needsSetup || settings) && <ProfilePanel state={state} />}
      {state.user && <MyBriefs userId={state.user.id} />}

      {shows.length > 0 && (
        <section>
          <h2 className="label">Hooked on</h2>
          <div className="hooked-on">
            {shows.slice(0, 4).map((s, i) => (
              <Link key={s.feedId} href={`/show/${s.feedId}`}>
                <Art src={s.image} title={s.title} size="100%" tilt={[-2, 1.5, -1, 2][i]} radius={18} className="art--fluid" />
              </Link>
            ))}
          </div>
          <p className="muted">
            {shows.slice(0, 4).map((s) => s.title).join(" · ")}
            {shows.length > 4 && (
              <button className="link-btn small" style={{ marginLeft: 8 }} onClick={() => setTab("shows")}>
                +{shows.length - 4} more
              </button>
            )}
          </p>
        </section>
      )}

      {np && !nowPlayingLogged && (
        <section className="card np">
          <p className="mono cobalt small">Listening now</p>
          <div className="row gap center">
            <Art src={np.image} title={np.feedTitle} size={64} radius={12} episodeId={np.id} />
            <div className="min0">
              <p className="title-md">{np.title}</p>
              <p className="muted">{np.feedTitle}</p>
            </div>
          </div>
          <div className="choice">
            <Link className="btn btn--display btn--cobalt" href={`/log/${np.id}?hooked=1`}>
              I'm hooked
            </Link>
            <Link className="btn btn--display" href={`/log/${np.id}?hooked=0`}>
              I'm not hooked
            </Link>
          </div>
        </section>
      )}

      <div className="tabs me-tabs" role="tablist">
        {TABS.map(([k, label]) => (
          <button key={k} className={`tab ${tab === k ? "is-on" : ""}`} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {label}
            {k === "upnext" && queue > 0 && <span className="tab__n">{queue}</span>}
          </button>
        ))}
      </div>

      {tab === "upnext" ? (
        <UpNextView state={state} />
      ) : logs.length === 0 && !(tab === "shows" && shows.length) ? (
        <section className="empty card" style={{ marginTop: 16 }}>
          <p className="display h-md">Nothing logged yet.</p>
          <p className="muted">Find an episode, hit play, then tell us: hooked, or not?</p>
          <Link className="btn btn--cobalt btn--shadow-sm" href="/search">
            Find something
          </Link>
        </section>
      ) : tab === "shows" ? (
        <ShowsView logs={logs} hooked={state.shows} />
      ) : tab === "stats" ? (
        <Wrapped logs={logs} />
      ) : (
        <Diary logs={logs} />
      )}
    </>
  );
}
