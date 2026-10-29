"use client";
// "Your listening, wrapped": what kinds of shows you log, inspired by Spotify Wrapped.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Art from "./Art";
import { genreLabel } from "@/lib/genres";

// Checked for colorblind separation; each slice also has an outline and a labeled legend row.
const COLORS = ["#2340FF", "#F0559F", "#D9A900", "#11957A", "#E8622E", "#7C4DFF"];
const OTHER = "#9C99AC";
const DAYS = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];
const MIN_LOGS = 3;

function hours(sec) {
  const h = sec / 3600;
  return h >= 10 ? Math.round(h) : Math.round(h * 10) / 10;
}

// Donut slice path from angle a0 to a1 (radians, 0 = 12 o'clock).
function arc(cx, cy, r0, r1, a0, a1) {
  const p = (r, a) => [cx + r * Math.sin(a), cy - r * Math.cos(a)];
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = p(r1, a0), [x1, y1] = p(r1, a1), [x2, y2] = p(r0, a1), [x3, y3] = p(r0, a0);
  return `M${x0} ${y0} A${r1} ${r1} 0 ${large} 1 ${x1} ${y1} L${x2} ${y2} A${r0} ${r0} 0 ${large} 0 ${x3} ${y3}Z`;
}

function Donut({ slices, active, onActive }) {
  const size = 220, c = size / 2, r1 = 104, r0 = 62;
  const total = slices.reduce((s, x) => s + x.value, 0);
  let a = 0;
  const shown = active != null ? slices[active] : slices[0];
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="donut" role="img" aria-label="Share of your listening by genre">
      {slices.length === 1 ? (
        <circle cx={c} cy={c} r={(r0 + r1) / 2} fill="none" stroke={slices[0].color} strokeWidth={r1 - r0} />
      ) : (
        slices.map((s, i) => {
          const a0 = a;
          const a1 = a + (s.value / total) * Math.PI * 2;
          a = a1;
          return (
            <path
              key={s.key}
              d={arc(c, c, r0, r1, a0, a1)}
              fill={s.color}
              stroke="#FFFFFF"
              strokeWidth="2.5"
              strokeLinejoin="round"
              opacity={active == null || active === i ? 1 : 0.35}
              onMouseEnter={() => onActive(i)}
              onMouseLeave={() => onActive(null)}
              onClick={() => onActive(active === i ? null : i)}
              style={{ cursor: "pointer", transition: "opacity .15s" }}
            >
              <title>{`${s.label}: ${s.pct}%`}</title>
            </path>
          );
        })
      )}
      <circle cx={c} cy={c} r={r1 + 1.5} fill="none" stroke="#15131D" strokeWidth="3" />
      <circle cx={c} cy={c} r={r0 - 1.5} fill="none" stroke="#15131D" strokeWidth="3" />
      <text x={c} y={c - 2} textAnchor="middle" className="donut__pct">
        {shown.pct}%
      </text>
      <text x={c} y={c + 22} textAnchor="middle" className="donut__label">
        {shown.label.length > 16 ? shown.label.split(" ")[0] : shown.label}
      </text>
    </svg>
  );
}

export default function Wrapped({ logs }) {
  const [genres, setGenres] = useState(null);
  const [active, setActive] = useState(null);
  const ids = useMemo(() => [...new Set(logs.map((l) => l.feedId).filter(Boolean))].sort().join(","), [logs]);

  useEffect(() => {
    if (logs.length < MIN_LOGS || !ids) return;
    let live = true;
    fetch(`/api/genres?ids=${ids}`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((g) => live && setGenres(g))
      .catch(() => live && setGenres({}));
    return () => {
      live = false;
    };
  }, [ids, logs.length]);

  if (logs.length < MIN_LOGS) {
    return (
      <section className="wrapped wrapped--locked">
        <p className="mono small">Your listening, wrapped</p>
        <p className="display wrapped__headline">Log {MIN_LOGS - logs.length} more to unlock.</p>
        <p className="muted">Once you've logged {MIN_LOGS} episodes, this shows what you're really into.</p>
      </section>
    );
  }

  // Weigh each log by its length, so a 2-hour episode counts more than a 10-minute one.
  const known = logs.map((l) => l.duration).filter(Boolean).sort((a, b) => a - b);
  const typical = known.length ? known[Math.floor(known.length / 2)] : 1800;
  const secs = (l) => l.duration || typical;
  const totalSecs = logs.reduce((s, l) => s + secs(l), 0);

  let slices = [];
  if (genres) {
    const byGenre = {};
    for (const l of logs) {
      const g = genres[String(l.feedId)] || "other";
      byGenre[g] = (byGenre[g] || 0) + secs(l);
    }
    const ranked = Object.entries(byGenre)
      .filter(([k]) => k !== "other")
      .sort((a, b) => b[1] - a[1]);
    // Name up to 6 genres; only fold into "Everything else" when there are more.
    const named = ranked.length + (byGenre.other ? 1 : 0) <= COLORS.length ? ranked.length : COLORS.length - 1;
    const top = ranked.slice(0, named);
    const rest = ranked.slice(named).reduce((s, [, v]) => s + v, 0) + (byGenre.other || 0);
    slices = top.map(([key, value], i) => ({ key, value, label: genreLabel(key), color: COLORS[i] }));
    if (rest > 0) slices.push({ key: "rest", value: rest, label: "Everything else", color: OTHER });
    const sum = slices.reduce((s, x) => s + x.value, 0) || 1;
    // Percentages that add up to 100.
    let left = 100;
    slices.forEach((s, i) => {
      s.pct = i === slices.length - 1 ? left : Math.round((s.value / sum) * 100);
      left -= s.pct;
    });
  }

  const hookedRate = Math.round((logs.filter((l) => l.hooked).length / logs.length) * 100);
  const rated = logs.filter((l) => l.rating > 0);
  const avg = rated.length ? (rated.reduce((s, l) => s + l.rating, 0) / rated.length).toFixed(1) : null;

  const showCount = {};
  for (const l of logs) if (l.feedId) showCount[l.feedId] = (showCount[l.feedId] || 0) + 1;
  const topShowId = Object.entries(showCount).sort((a, b) => b[1] - a[1])[0]?.[0];
  const topShow = topShowId ? logs.find((l) => String(l.feedId) === topShowId) : null;

  const dayCount = Array(7).fill(0);
  for (const l of logs) dayCount[new Date(l.loggedAt).getDay()]++;
  const topDay = dayCount.indexOf(Math.max(...dayCount));

  const lead = slices.find((s) => s.key !== "rest");

  return (
    <section className="wrapped" aria-labelledby="wrapped-title">
      <p className="mono small wrapped__kicker" id="wrapped-title">
        Your listening, wrapped · only you can see this
      </p>
      <p className="display wrapped__headline">
        {lead ? (
          <>
            You're a <span className="wrapped__hl">{lead.label.toLowerCase()}</span> person.
          </>
        ) : genres ? (
          "You listen to a bit of everything."
        ) : (
          "Crunching your log…"
        )}
      </p>

      {slices.length > 0 && (
        <div className="wrapped__chart">
          <Donut slices={slices} active={active} onActive={setActive} />
          <ul className="wrapped__legend">
            {slices.map((s, i) => (
              <li
                key={s.key}
                className={active === i ? "is-on" : ""}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
              >
                <span className="wrapped__swatch" style={{ background: s.color }} aria-hidden="true" />
                <span className="grow">{s.label}</span>
                <span className="mono">{s.pct}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="wrapped__stats">
        <div className="stat">
          <span className="stat__num">{hours(totalSecs)}</span>
          <span className="stat__label">hours logged</span>
        </div>
        <div className="stat">
          <span className="stat__num">{hookedRate}%</span>
          <span className="stat__label">got you hooked</span>
        </div>
        <div className="stat">
          <span className="stat__num">{avg ? `${avg}★` : "–"}</span>
          <span className="stat__label">average rating</span>
        </div>
        <div className="stat">
          <span className="stat__num stat__num--sm">{DAYS[topDay]}</span>
          <span className="stat__label">your big logging day</span>
        </div>
      </div>

      {topShow && (
        <div className="wrapped__top">
          <Art src={topShow.feedImage || topShow.image} title={topShow.feedTitle} size={64} radius={14} feedId={topShow.feedId} />
          <div className="min0">
            <p className="mono small">Most logged show</p>
            <Link href={`/show/${topShow.feedId}`} className="title-md" style={{ display: "block" }}>
              {topShow.feedTitle}
            </Link>
            <p className="muted small">{showCount[topShowId]} episodes</p>
          </div>
        </div>
      )}
    </section>
  );
}
