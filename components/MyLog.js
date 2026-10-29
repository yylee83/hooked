"use client";
import Link from "next/link";
import Art from "./Art";
import Stars from "./Stars";
import { hookedShows, removeFromList, useStore } from "@/lib/store";
import { plural } from "@/lib/format";
import { site } from "@/lib/site";

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
        <div className="avatar avatar--lg">{site.me.initials}</div>
        <div>
          <h1 className="display me__title">My log</h1>
          <p className="mono me__stats">
            {plural(logs.length, "episode")} · Hooked on {plural(shows.length, "show")}
          </p>
        </div>
      </header>

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
            <Art src={np.image} title={np.feedTitle} size={64} radius={12} />
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
                <Art src={i.image} title={i.feedTitle} size={48} radius={10} />
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
                  <Art src={l.image} title={l.feedTitle} size={56} radius={12} />
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
