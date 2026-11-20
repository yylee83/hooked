"use client";
// "Your listening, wrapped", inspired by Spotify Wrapped. Led by what you actually play in Hooked's player (YY,
// 2026-11-20), with your logs underneath. Before you've played anything here, it's worked out from your logs instead.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Art from "./Art";
import { genreLabel } from "@/lib/genres";
import { showHref } from "@/lib/addresses";
import { findHookedShow, showKey } from "@/lib/store";
import { listenedHours, useMyListening } from "@/lib/my-listening";

// Checked for colorblind separation; each slice also has an outline and a labeled legend row.
const COLORS = ["#2340FF", "#F0559F", "#D9A900", "#11957A", "#E8622E", "#7C4DFF"];
const OTHER = "#9C99AC";
const DAYS = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];
const MIN_LOGS = 3;
const MIN_LISTEN = 10 * 60; // 10 minutes played here and Wrapped switches to your listening
const TIMES = [
  [5, 12, "Mornings"],
  [12, 17, "Afternoons"],
  [17, 22, "Evenings"],
  [22, 29, "Late nights"], // 10pm to 5am
];
const hours = listenedHours;

// Split into named slices (up to 6, then "Everything else"), with percentages that add up to 100.
function toSlices(byGenre) {
  const ranked = Object.entries(byGenre)
    .filter(([k]) => k !== "other")
    .sort((a, b) => b[1] - a[1]);
  const named = ranked.length + (byGenre.other ? 1 : 0) <= COLORS.length ? ranked.length : COLORS.length - 1;
  const top = ranked.slice(0, named);
  const rest = ranked.slice(named).reduce((s, [, v]) => s + v, 0) + (byGenre.other || 0);
  const slices = top.map(([key, value], i) => ({ key, value, label: genreLabel(key), color: COLORS[i] }));
  if (rest > 0) slices.push({ key: "rest", value: rest, label: "Everything else", color: OTHER });
  const sum = slices.reduce((s, x) => s + x.value, 0) || 1;
  let left = 100;
  slices.forEach((s, i) => {
    s.pct = i === slices.length - 1 ? left : Math.round((s.value / sum) * 100);
    left -= s.pct;
  });
  return slices;
}

// When in the day you listen most: the busiest of mornings, afternoons, evenings and late nights.
function topTime(hrs) {
  const sums = TIMES.map(([from, to]) => {
    let t = 0;
    for (let h = from; h < to; h++) t += hrs[h % 24] || 0;
    return t;
  });
  return TIMES[sums.indexOf(Math.max(...sums))][2];
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

export default function Wrapped({ logs, hooked = {}, userId = null }) {
  const [got, setGot] = useState(null); // { ids, genres }
  const [active, setActive] = useState(null);
  const listening = useMyListening(userId);
  const fromListening = Boolean(listening && listening.seconds >= MIN_LISTEN);
  // Our show id, or the Podcast Index number for older logs saved on this device.
  const ids = useMemo(
    () => (fromListening ? listening.shows.map((s) => s.id) : [...new Set(logs.map(showKey).filter(Boolean))]).sort().join(","),
    [fromListening, listening, logs]
  );
  const enough = fromListening || logs.length >= MIN_LOGS;

  useEffect(() => {
    if (!enough || !ids) return;
    let live = true;
    fetch(`/api/genres?ids=${ids}`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((g) => live && setGot({ ids, genres: g }))
      .catch(() => live && setGot({ ids, genres: {} }));
    return () => {
      live = false;
    };
  }, [ids, enough]);

  const genres = got?.ids === ids ? got.genres : null;

  if (!enough) {
    if (listening === undefined) return <div className="loading" aria-label="Loading" />;
    return (
      <section className="wrapped wrapped--locked">
        <p className="mono small">Your listening, wrapped</p>
        <p className="display wrapped__headline">Press play to unlock.</p>
        <p className="muted">
          {userId
            ? "Listen to a few episodes here, or log " + MIN_LOGS + ", and this shows what you're really into."
            : "Once you've logged " + MIN_LOGS + " episodes, this shows what you're really into. Sign in and what you play here counts too."}
        </p>
      </section>
    );
  }

  // ---------- from your logs ----------
  const rated = logs.filter((l) => l.rating > 0);
  const avg = rated.length ? (rated.reduce((s, l) => s + l.rating, 0) / rated.length).toFixed(1) : null;
  // Counted by show: our show id, or the Podcast Index number for older logs saved on this device.
  const showOf = (l) => String(l.showRef || l.feedId || "");
  // % hooked (Decision 6): of the shows you've logged, the share you're hooked on.
  const loggedShows = [...new Map(logs.filter(showOf).map((l) => [showOf(l), { showRef: l.showRef, feedId: l.feedId }])).values()];
  const hookedRate = loggedShows.length ? Math.round((loggedShows.filter((s) => findHookedShow({ shows: hooked }, s)).length / loggedShows.length) * 100) : 0;

  // ---------- the chart, the stats and the top show ----------
  let slices = [];
  let stats;
  let top = null;
  if (fromListening) {
    if (genres) {
      const byGenre = {};
      for (const s of listening.shows) {
        const g = genres[s.id] || "other";
        byGenre[g] = (byGenre[g] || 0) + s.seconds;
      }
      slices = toSlices(byGenre);
    }
    const days = listening.days || [];
    const best = listening.shows[0];
    stats = [
      [hours(listening.seconds), "hours listened on Hooked"],
      [listening.finished, `episodes finished, of ${listening.episodes} played`],
      [DAYS[days.indexOf(Math.max(...days))], "your big listening day", true],
      [topTime(listening.hours || []), "when you listen most", true],
    ];
    if (best) top = { label: "Most listened show", showRef: best.id, feedId: best.podcastindex_id, title: best.title, image: best.image, line: `${hours(best.seconds)} hrs · ${best.episodes} ${best.episodes === 1 ? "episode" : "episodes"}` };
  } else {
    // Weigh each log by its length, so a 2-hour episode counts more than a 10-minute one.
    const known = logs.map((l) => l.duration).filter(Boolean).sort((a, b) => a - b);
    const typical = known.length ? known[Math.floor(known.length / 2)] : 1800;
    const secs = (l) => l.duration || typical;
    const totalSecs = logs.reduce((s, l) => s + secs(l), 0);
    if (genres) {
      const byGenre = {};
      for (const l of logs) {
        const g = genres[showKey(l)] || "other";
        byGenre[g] = (byGenre[g] || 0) + secs(l);
      }
      slices = toSlices(byGenre);
    }
    const showCount = {};
    for (const l of logs) if (showOf(l)) showCount[showOf(l)] = (showCount[showOf(l)] || 0) + 1;
    const topShowId = Object.entries(showCount).sort((a, b) => b[1] - a[1])[0]?.[0];
    const topShow = topShowId ? logs.find((l) => showOf(l) === topShowId) : null;
    const dayCount = Array(7).fill(0);
    for (const l of logs) dayCount[new Date(l.loggedAt).getDay()]++;
    stats = [
      [logs.length, `episodes logged · ${hours(totalSecs)} hrs`],
      [`${hookedRate}%`, "of your shows got you hooked"],
      [avg ? `${avg}★` : "–", "average rating"],
      [DAYS[dayCount.indexOf(Math.max(...dayCount))], "your big logging day", true],
    ];
    if (topShow) top = { label: "Most logged show", showRef: topShow.showRef, feedId: topShow.feedId, title: topShow.feedTitle, image: topShow.feedImage || topShow.image, line: `${showCount[topShowId]} ${showCount[topShowId] === 1 ? "episode" : "episodes"}` };
  }

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
          "Crunching your listening…"
        )}
      </p>
      {!fromListening && userId && listening !== undefined && (
        <p className="muted small wrapped__nudge">For now this comes from your log. Press play here and your listening shows up in Wrapped.</p>
      )}

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
        {stats.map(([num, label, small]) => (
          <div className="stat" key={label}>
            <span className={`stat__num ${small ? "stat__num--sm" : ""}`}>{num}</span>
            <span className="stat__label">{label}</span>
          </div>
        ))}
      </div>

      {top && (
        <div className="wrapped__top">
          <Art src={top.image} title={top.title} size={64} radius={14} showRef={top.showRef} feedId={top.feedId} />
          <div className="min0">
            <p className="mono small">{top.label}</p>
            <Link href={showHref(top.showRef, top.feedId)} className="title-md" style={{ display: "block" }}>
              {top.title}
            </Link>
            <p className="muted small">{top.line}</p>
          </div>
        </div>
      )}

      {fromListening && logs.length > 0 && (
        <div className="wrapped__fromlog">
          <p className="mono small">From your log</p>
          <p className="small">
            <b>{logs.length}</b> {logs.length === 1 ? "episode" : "episodes"} logged
            {avg && (
              <>
                {" · "}
                <b>★ {avg}</b> average
              </>
            )}
            {loggedShows.length > 0 && (
              <>
                {" · "}
                <b>{hookedRate}%</b> of your shows got you hooked
              </>
            )}
          </p>
        </div>
      )}
    </section>
  );
}
