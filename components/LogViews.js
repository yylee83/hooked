"use client";
// The tabs on My log: Diary, Shows, Up next. Built to stay easy to browse at 10 logs or 500.
import Link from "next/link";
import { useMemo, useState } from "react";
import Art from "./Art";
import Stars from "./Stars";
import { usePlayer } from "./Player";
import { removeFromList, upNext } from "@/lib/store";
import { plural } from "@/lib/format";

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

const norm = (s = "") => s.toLowerCase();

// ---------- Diary: every episode you logged, newest first ----------
const FILTERS = [
  ["all", "All"],
  ["hooked", "Hooked"],
  ["not", "Not hooked"],
  ["top", "★ 4+"],
  ["reviews", "With a hook"],
];

export function Diary({ logs }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [shown, setShown] = useState(30);

  const list = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean);
    return logs.filter((l) => {
      if (filter === "hooked" && !l.hooked) return false;
      if (filter === "not" && l.hooked) return false;
      if (filter === "top" && !(l.rating >= 4)) return false;
      if (filter === "reviews" && !l.hook) return false;
      const hay = norm(`${l.title} ${l.feedTitle} ${l.hook}`);
      return words.every((w) => hay.includes(w));
    });
  }, [logs, q, filter]);

  return (
    <>
      <input
        className="input log-search"
        type="search"
        placeholder={`Search your ${plural(logs.length, "log")}`}
        value={q}
        onChange={(e) => (setQ(e.target.value), setShown(30))}
        aria-label="Search your log"
      />
      <div className="filters" role="group" aria-label="Filter">
        {FILTERS.map(([k, label]) => (
          <button key={k} className={`chip chip--sm ${filter === k ? "chip--on" : ""}`} onClick={() => (setFilter(k), setShown(30))} aria-pressed={filter === k}>
            {label}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <p className="muted" style={{ marginTop: 18 }}>Nothing matches that.</p>
      ) : (
        groupByMonth(list.slice(0, shown)).map((g) => (
          <section key={g.label} className="diary">
            <h2 className="diary__month">
              {g.label} <span className="mono muted">{g.items.length}</span>
            </h2>
            <ul className="diary__list">
              {g.items.map((l) => (
                <li key={l.id}>
                  <Link href={`/episode/${l.id}`} className="diary__row">
                    <span className="mono diary__day">{new Date(l.loggedAt).getDate()}</span>
                    <Art src={l.image} title={l.feedTitle} size={46} radius={10} />
                    <span className="min0 grow">
                      <span className="diary__title">{l.title}</span>
                      <span className="diary__meta">
                        <span className="diary__show">{l.feedTitle}</span>
                        {l.rating > 0 && <Stars value={l.rating} size={13} />}
                      </span>
                      {l.hook && <span className="diary__hook">“{l.hook}”</span>}
                    </span>
                    <span className={`diary__verdict ${l.hooked ? "is-hooked" : ""}`} title={l.hooked ? "Hooked" : "Not hooked"}>
                      {l.hooked ? "Hooked" : "Not"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      {list.length > shown && (
        <button className="btn btn--shadow-sm load-more" onClick={() => setShown(shown + 30)}>
          Show {Math.min(30, list.length - shown)} more
        </button>
      )}
    </>
  );
}

// ---------- Shows: your logs rolled up by show ----------
const SORTS = [
  ["most", "Most logged"],
  ["rated", "Highest rated"],
  ["recent", "Recent"],
];

export function showsFromLogs(logs, hooked = {}) {
  const map = new Map();
  for (const l of logs) {
    const k = String(l.feedId || l.feedTitle);
    if (!map.has(k)) map.set(k, { feedId: l.feedId, title: l.feedTitle, image: l.feedImage || l.image, logs: [], last: 0 });
    const s = map.get(k);
    s.logs.push(l);
    s.last = Math.max(s.last, l.loggedAt);
  }
  // Shows you're hooked on but haven't logged an episode of yet.
  for (const h of Object.values(hooked)) {
    const k = String(h.feedId);
    if (!map.has(k)) map.set(k, { feedId: h.feedId, title: h.title, image: h.image, logs: [], last: h.at || 0 });
  }
  return [...map.values()].map((s) => {
    const rated = s.logs.filter((l) => l.rating > 0);
    return {
      ...s,
      avg: rated.length ? rated.reduce((a, l) => a + l.rating, 0) / rated.length : 0,
      hookedCount: s.logs.filter((l) => l.hooked).length,
      isHookedOn: !!hooked[s.feedId],
    };
  });
}

export function ShowsView({ logs, hooked }) {
  const [sort, setSort] = useState("most");
  const [open, setOpen] = useState(null);
  const shows = useMemo(() => {
    const list = showsFromLogs(logs, hooked);
    const by = {
      most: (a, b) => b.logs.length - a.logs.length || b.avg - a.avg,
      rated: (a, b) => b.avg - a.avg || b.logs.length - a.logs.length,
      recent: (a, b) => b.last - a.last,
    }[sort];
    return list.sort(by);
  }, [logs, hooked, sort]);

  return (
    <>
      <div className="filters" role="group" aria-label="Sort">
        {SORTS.map(([k, label]) => (
          <button key={k} className={`chip chip--sm ${sort === k ? "chip--on" : ""}`} onClick={() => setSort(k)} aria-pressed={sort === k}>
            {label}
          </button>
        ))}
      </div>
      <p className="muted small" style={{ margin: "4px 0 8px" }}>
        {plural(shows.length, "show")}. Your rating for a show is the average of the episodes you've rated.
      </p>
      <ul className="shows-list">
        {shows.map((s) => {
          const k = String(s.feedId || s.title);
          const isOpen = open === k;
          return (
            <li key={k} className="shows-list__item">
              <button className="shows-list__row" onClick={() => setOpen(isOpen ? null : k)} aria-expanded={isOpen}>
                <Art src={s.image} title={s.title} size={56} radius={12} />
                <span className="min0 grow">
                  <span className="diary__title">{s.title}</span>
                  <span className="diary__meta">
                    {s.avg > 0 && (
                      <>
                        <Stars value={Math.round(s.avg * 2) / 2} size={13} />
                        <span className="mono">{s.avg.toFixed(1)}</span>
                      </>
                    )}
                  </span>
                  <span className="mono small muted">
                    {s.logs.length
                      ? `${plural(s.logs.length, "episode")} · hooked on ${s.hookedCount} of ${s.logs.length}`
                      : "No episodes logged yet"}
                  </span>
                </span>
                {s.isHookedOn && <span className="sticker shows-list__badge">Hooked on</span>}
                <span className="shows-list__chev" aria-hidden="true">{isOpen ? "–" : "+"}</span>
              </button>
              {isOpen && (
                <div className="shows-list__eps">
                  {s.logs
                    .sort((a, b) => b.loggedAt - a.loggedAt)
                    .map((l) => (
                      <Link key={l.id} href={`/episode/${l.id}`} className="shows-list__ep">
                        <span className="min0 grow">{l.title}</span>
                        {l.rating > 0 ? <Stars value={l.rating} size={12} /> : <span className="muted small">{l.hooked ? "Hooked" : "Not hooked"}</span>}
                      </Link>
                    ))}
                  {s.feedId && (
                    <Link href={`/show/${s.feedId}`} className="more-link" style={{ display: "inline-block", marginTop: 8 }}>
                      Go to the show →
                    </Link>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

// ---------- Up next: your queue ----------
export function UpNextView({ state }) {
  const player = usePlayer();
  const list = upNext(state);
  const [failed, setFailed] = useState(null);

  async function play(item) {
    setFailed(null);
    const ok = await player?.playItem(item);
    if (!ok) setFailed(item.episodeId || item.title);
  }

  if (!list.length) {
    return (
      <div className="empty card" style={{ marginTop: 16 }}>
        <p className="display h-md">Nothing up next.</p>
        <p className="muted">Tap “+ Up next” on any episode and it lands here. When one finishes, the next one starts.</p>
        <Link className="btn btn--cobalt btn--shadow-sm" href="/search">
          Find something
        </Link>
      </div>
    );
  }

  const first = list.find((i) => i.episodeId);
  return (
    <>
      {first && (
        <button className="btn btn--cobalt btn--shadow-sm" style={{ marginTop: 14 }} onClick={() => play(first)}>
          ▶ Play Up next
        </button>
      )}
      <ol className="upnext">
        {list.map((i, n) => {
          const key = i.episodeId || i.title;
          return (
            <li key={key} className="list__row">
              <span className="mono upnext__n">{n + 1}</span>
              <Art src={i.image} title={i.feedTitle} size={48} radius={10} episodeId={i.episodeId} feedId={i.feedId} />
              <div className="min0 grow">
                {i.episodeId ? (
                  <Link href={`/episode/${i.episodeId}`} className="title-sm">
                    {i.title}
                  </Link>
                ) : (
                  <p className="title-sm">{i.title}</p>
                )}
                <p className="muted small">
                  {i.feedTitle}
                  {i.from ? ` · from ${i.from}` : ""}
                </p>
                {failed === key && <p className="nudge small">Couldn't play this one.</p>}
              </div>
              <div className="upnext__actions">
                {i.episodeId && (
                  <button className="btn btn--sm" onClick={() => play(i)} aria-label={`Play ${i.title}`}>
                    ▶
                  </button>
                )}
                <button className="link-btn small" onClick={() => removeFromList(i)} aria-label="Remove from Up next">
                  Remove
                </button>
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}
