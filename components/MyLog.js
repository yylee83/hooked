"use client";
import Link from "next/link";
import Art from "./Art";
import Stars from "./Stars";
import { useEffect, useState } from "react";
import { hookedShows, initialsOf, removeFromList, saveProfile, signOut, useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase/client";
import { minutes, plural } from "@/lib/format";
import { site } from "@/lib/site";

// Sign-in prompt, first-time handle setup, or profile controls.
function ProfilePanel({ state }) {
  const [editing, setEditing] = useState(false);
  const [handle, setHandle] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!state.accounts) return null;

  if (!state.user) {
    return (
      <div className="card profile-cta">
        <p className="display h-md" style={{ margin: 0 }}>Make it yours.</p>
        <p style={{ margin: "8px 0 16px" }}>
          Your log is only saved on this device. Make a profile to keep it, share it, and make briefs.
        </p>
        <Link href="/login?next=/me" className="btn btn--cobalt btn--shadow-sm">
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
      <div className="row gap center" style={{ marginTop: 14 }}>
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
        <button className="link-btn small" onClick={() => signOut()}>
          Sign out
        </button>
      </div>
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

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function groupByMonth(logs) {
  const groups = [];
  for (const l of logs) {
    const d = new Date(l.loggedAt);
    const label = d.getFullYear() === new Date().getFullYear() ? MONTHS[d.getMonth()] : `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(l);
    else groups.push({ label, items: [l] });
  }
  return groups;
}

export default function MyLog() {
  const state = useStore();
  if (!state) return <div className="loading" aria-label="Loading" />;

  const shows = hookedShows(state);
  const logs = state.logs;
  const np = state.nowPlaying;
  const nowPlayingLogged = np && logs.some((l) => l.id === np.id);

  return (
    <>
      <header className="me">
        <div className="avatar avatar--lg">{state.user ? initialsOf(state.profile) : site.me.initials}</div>
        <div className="min0">
          <h1 className="display me__title">My log</h1>
          {state.profile?.handle && <p className="me__handle">@{state.profile.handle}</p>}
          <p className="mono me__stats">
            {plural(logs.length, "episode")} · Hooked on {plural(shows.length, "show")}
          </p>
        </div>
      </header>

      {state.error && <div className="notice"><p>{state.error}</p></div>}
      <ProfilePanel state={state} />
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
          <p className="muted">{shows.slice(0, 4).map((s) => s.title).join(" · ")}</p>
        </section>
      )}

      {np && !nowPlayingLogged && (
        <section className="card np">
          <p className="mono cobalt small">Listening now</p>
          <div className="row gap center">
            <Art src={np.image} title={np.feedTitle} size={64} radius={12} feedId={np.feedId} />
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

      {state.list.length > 0 && (
        <section>
          <h2 className="label">On my list</h2>
          <ul className="list">
            {state.list.map((i) => (
              <li key={i.episodeId || i.title} className="list__row">
                <Art src={i.image} title={i.feedTitle} size={48} radius={10} feedId={i.feedId} />
                <div className="min0 grow">
                  {i.episodeId ? (
                    <Link href={`/log/${i.episodeId}`} className="title-sm">
                      {i.title}
                    </Link>
                  ) : (
                    <p className="title-sm">{i.title}</p>
                  )}
                  <p className="muted small">
                    {i.feedTitle}
                    {i.from ? ` · from ${i.from}` : ""}
                  </p>
                </div>
                <button className="link-btn small" onClick={() => removeFromList(i)} aria-label="Remove from list">
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {logs.length === 0 ? (
        <section className="empty card">
          <p className="display h-md">Nothing logged yet.</p>
          <p className="muted">Find an episode, hit play, then tell us: hooked, or not?</p>
          <Link className="btn btn--cobalt btn--shadow-sm" href="/search">
            Find something
          </Link>
        </section>
      ) : (
        groupByMonth(logs).map((g) => (
          <section key={g.label}>
            <h2 className="label">{g.label}</h2>
            <ul className="log">
              {g.items.map((l) => (
                <li key={l.id} className="log__row">
                  <span className="mono log__day">{new Date(l.loggedAt).getDate()}</span>
                  <Art src={l.image} title={l.feedTitle} size={56} radius={12} feedId={l.feedId} />
                  <Link href={`/log/${l.id}`} className="min0">
                    <p className="title-sm">{l.title}</p>
                    <p className="muted small row gap-xs center wrap">
                      {l.feedTitle}
                      {l.rating > 0 && (
                        <>
                          <span>·</span>
                          <Stars value={l.rating} size={15} />
                        </>
                      )}
                    </p>
                    {l.hook && <p className="log__hook">“{l.hook}”</p>}
                  </Link>
                  <span className={`sticker ${l.hooked ? "" : "sticker--outline"}`}>{l.hooked ? "Hooked" : "Not hooked"}</span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
