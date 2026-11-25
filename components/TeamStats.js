"use client";
// The team's stats page (/stats). Numbers come from team_stats() in the database
// (supabase/migrations/20261125220000_team_stats.sql), which answers Erin and YY only and returns totals, never
// who did what.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase/client";
import { episodeHref, showHref } from "@/lib/addresses";

const RANGES = [7, 30, 90];
const SERIES = [
  { key: "active", label: "Active people" },
  { key: "signups", label: "Sign-ups" },
  { key: "app_minutes", label: "Minutes in the app" },
  { key: "minutes", label: "Minutes listening" },
  { key: "logs", label: "Logs" },
  { key: "replies", label: "Replies" },
];
const HEARD = {
  friend: "A friend", invite: "An invite", instagram: "Instagram", tiktok: "TikTok", x: "X", podcast: "A podcast",
  article: "An article", search: "Search", other: "Something else",
};

const n = (v) => Number(v || 0).toLocaleString("en-US");
const per = (total, count) => (count ? Math.round(Number(total) / Number(count)) : 0);
const hours = (min) => (min >= 600 ? `${n(Math.round(min / 60))} hrs` : min >= 60 ? `${(min / 60).toFixed(1)} hrs` : `${n(min)} min`);

function Tile({ label, value, note }) {
  return (
    <div className="stats-tile">
      <div className="stats-tile__value">{value}</div>
      <div className="stats-tile__label">{label}</div>
      {note ? <div className="stats-tile__note">{note}</div> : null}
    </div>
  );
}

function DayChart({ daily, series }) {
  const max = Math.max(1, ...daily.map((d) => d[series.key] || 0));
  const fmt = (day) => new Date(`${day}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const total = daily.reduce((s, d) => s + (d[series.key] || 0), 0);
  return (
    <figure className="stats-chart" aria-label={`${series.label} per day`}>
      <div className="stats-chart__bars" style={{ gap: daily.length > 40 ? 1 : 2 }}>
        {daily.map((d) => (
          <div key={d.day} className="stats-chart__slot" title={`${fmt(d.day)}: ${n(d[series.key])}`}>
            <div className="stats-chart__bar" style={{ height: `${((d[series.key] || 0) / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <figcaption className="stats-chart__axis">
        <span>{daily.length ? fmt(daily[0].day) : ""}</span>
        <span>Most in a day: {n(max === 1 && !total ? 0 : max)}</span>
        <span>{daily.length ? fmt(daily[daily.length - 1].day) : ""}</span>
      </figcaption>
    </figure>
  );
}

function TopList({ title, rows, render, empty = "Nothing yet." }) {
  return (
    <section className="stats-list">
      <h2 className="stats-h">{title}</h2>
      {rows?.length ? (
        <ol>
          {rows.map((r, i) => (
            <li key={i}>{render(r)}</li>
          ))}
        </ol>
      ) : (
        <p className="muted small">{empty}</p>
      )}
    </section>
  );
}

export default function TeamStats() {
  const state = useStore();
  const uid = state?.user?.id;
  const [days, setDays] = useState(30);
  const [series, setSeries] = useState(SERIES[0]);
  const [res, setRes] = useState({ status: "loading", key: "" });
  const key = `${uid}|${days}`;

  useEffect(() => {
    if (!uid) return;
    let live = true;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    supabase()
      .rpc("team_stats", { p_days: days, p_tz: tz })
      .then(({ data, error }) => {
        if (!live) return;
        if (error) return setRes((r) => ({ ...r, key, status: error.code === "42501" ? "not-team" : "error" }));
        setRes({ status: "ok", data, key });
      });
    return () => { live = false; };
  }, [uid, days, key]);

  const signedOut = state?.ready && !uid;
  if (signedOut || res.status === "not-team") {
    return (
      <div className="stats">
        <h1 className="display h-lg cobalt">Stats</h1>
        <p className="muted">This page is just for the Hooked team.</p>
        {signedOut ? <Link className="btn" href="/login?next=/stats">Sign in</Link> : null}
      </div>
    );
  }
  const refreshing = res.data && res.key !== key;

  const s = res.data;
  const p = s?.period || {};
  const all = s?.all_time || {};

  return (
    <div className="stats">
      <h1 className="display h-lg cobalt">Stats</h1>
      <p className="muted small stats-sub">Only the Hooked team can see this. Signed-in people only.</p>

      <div className="stats-ranges" role="group" aria-label="Time range">
        {RANGES.map((d) => (
          <button key={d} type="button" className={`chip chip--sm${d === days ? " chip--on" : ""}`} onClick={() => setDays(d)}>
            {d} days
          </button>
        ))}
      </div>

      {res.status === "error" && res.key === key ? <p className="muted">Couldn&rsquo;t load the stats. Try again in a minute.</p> : null}
      {!s ? (
        res.status === "error" ? null : <p className="muted">Loading…</p>
      ) : (
        <div style={{ opacity: refreshing ? 0.5 : 1 }}>
          <h2 className="stats-h">People</h2>
          <div className="stats-tiles">
            <Tile label="Active people" value={n(p.active)} note="did anything signed in" />
            <Tile label="New sign-ups" value={n(p.signups)} />
            <Tile label="Joined by invite link" value={n(p.invites_used)} />
            <Tile label="Joined the waitlist" value={n(p.waitlist_joins)} note={`${n(all.waitlist)} waiting now`} />
          </div>

          <h2 className="stats-h">Time</h2>
          <div className="stats-tiles">
            <Tile label="In the app, per person a day" value={`${per(p.app_minutes, p.app_person_days)} min`} note={`${hours(p.app_minutes || 0)} in all`} />
            <Tile label="Listening, per person a day" value={`${per(p.minutes, p.listen_person_days)} min`} note={`${hours(p.minutes || 0)} in all`} />
            <Tile label="Plays" value={n(p.plays)} note={`${n(p.listeners)} people`} />
            <Tile label="Finished" value={n(p.finishes)} note={p.plays ? `${Math.round((100 * p.finishes) / p.plays)}% of plays` : null} />
          </div>

          <h2 className="stats-h">Activity</h2>
          <div className="stats-tiles">
            <Tile label="Logs" value={n(p.logs)} />
            <Tile label="Reviews" value={n(p.reviews)} />
            <Tile label="Replies" value={n(p.replies)} />
            <Tile label="Thumbs up" value={n(p.thumbs)} />
            <Tile label="Sends" value={n(p.sends)} />
            <Tile label="Shares outside" value={n(p.shares)} />
            <Tile label="Follows" value={n(p.follows)} />
            <Tile label="Up next adds" value={n(p.up_next)} />
          </div>

          <h2 className="stats-h">Day by day</h2>
          <div className="stats-ranges stats-ranges--wrap" role="group" aria-label="What to chart">
            {SERIES.map((x) => (
              <button key={x.key} type="button" className={`chip chip--sm${x.key === series.key ? " chip--on" : ""}`} onClick={() => setSeries(x)}>
                {x.label}
              </button>
            ))}
          </div>
          <DayChart daily={s.daily || []} series={series} />

          <TopList
            title="Most active people"
            rows={s.top_people}
            render={(u) => (
              <>
                <Link href={`/u/${u.handle}`} className="stats-list__title">@{u.handle}</Link>
                {u.display_name ? <span className="muted"> · {u.display_name}</span> : null}
                <div className="stats-list__nums">
                  here {n(u.days_active)} {u.days_active === 1 ? "day" : "days"} · {hours(u.minutes || 0)} listening
                  {u.app_minutes ? ` · ${hours(u.app_minutes)} in the app` : ""} · {n(u.logs)} logs · {n(u.reviews)} reviews · {n(u.replies)} replies
                </div>
              </>
            )}
          />
          <TopList
            title="Top episodes"
            rows={s.top_episodes}
            render={(e) => (
              <>
                <Link href={episodeHref(e.id)} className="stats-list__title">{e.title}</Link>
                <span className="muted"> · {e.show_title}</span>
                <div className="stats-list__nums">
                  {n(e.listeners)} listened · {n(e.logs)} logged{e.avg_rating ? ` · ${e.avg_rating}★` : ""}
                </div>
              </>
            )}
          />
          <TopList
            title="Top shows"
            rows={s.top_shows}
            render={(x) => (
              <>
                <Link href={showHref(x.id)} className="stats-list__title">{x.title}</Link>
                <div className="stats-list__nums">{hours(x.minutes || 0)} listened · {n(x.plays)} plays · {n(x.logs)} logged</div>
              </>
            )}
          />
          <TopList
            title="Top searches"
            rows={s.top_searches}
            render={(q) => (
              <>
                <span className="stats-list__title">{q.query}</span>
                <div className="stats-list__nums">
                  {n(q.times)} times · {n(q.people)} {q.people === 1 ? "person" : "people"}
                  {q.empty ? ` · ${n(q.empty)} found nothing` : ""}
                </div>
              </>
            )}
          />
          <TopList
            title="How people heard about Hooked"
            rows={s.heard_from}
            empty="No answers yet."
            render={(h) => (
              <>
                <span className="stats-list__title">{HEARD[h.source] || h.source}</span>
                <span className="stats-list__nums"> · {n(h.people)}</span>
              </>
            )}
          />

          <p className="muted small stats-foot">
            All time: {n(all.people)} people · {n(all.logs)} logs · {n(all.reviews)} reviews · {n(all.replies)} replies ·{" "}
            {n(all.follows)} follows · {n(all.hours)} hours listened.
          </p>
          <p className="muted small stats-foot">
            Time in the app counts a minute when a signed-in person has Hooked on screen and tapped, scrolled or typed in
            the last 2 minutes. It started on Nov 25, 2026. For visitors who never sign in, see Google Analytics:
            Reports → Engagement → &ldquo;Average engagement time&rdquo;.
          </p>
        </div>
      )}
    </div>
  );
}
