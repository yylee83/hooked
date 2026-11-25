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

const FUNNEL = [
  { key: "signed_up", label: "Signed up" },
  { key: "onboarded", label: "Finished the welcome steps" },
  { key: "played", label: "Played an episode" },
  { key: "logged", label: "Logged an episode" },
  { key: "followed", label: "Followed someone" },
  { key: "came_back", label: "Came back another day" },
];
const SOURCES = {
  up_next: "Up next", search: "Search", home: "Home", episode: "Episode pages", show: "Show pages", brief: "Lists",
  profile: "Profiles", my_log: "My log", resume: "Picking up where they left off", other: "Other (player, downloads)",
};
const CROWDS = [
  { key: "active", label: "Most active", note: "Most days on Hooked." },
  { key: "listeners", label: "Listeners", note: "Most time listening in Hooked's player." },
  { key: "critics", label: "Critics", note: "Most reviews, and thumbs up and replies on them." },
  { key: "connectors", label: "Connectors", note: "Bring people in: invites that joined, sends that got played, shares." },
];

const n = (v) => Number(v || 0).toLocaleString("en-US");
const per = (total, count) => (count ? Math.round(Number(total) / Number(count)) : 0);
const hours = (min) => (min >= 600 ? `${n(Math.round(min / 60))} hrs` : min >= 60 ? `${(min / 60).toFixed(1)} hrs` : `${n(min)} min`);

const pct = (part, whole) => (whole ? `${Math.round((100 * Number(part || 0)) / Number(whole))}%` : "–");
const fmtDay = (day) => new Date(`${day}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const countryName = (code) => {
  if (!code || code === "?") return "Didn’t say";
  try { return new Intl.DisplayNames(["en"], { type: "region" }).of(code) || code; } catch { return code; }
};
function crowdLine(crowd, u) {
  const s = (v, one, many) => `${n(v)} ${Number(v) === 1 ? one : many}`;
  if (crowd === "listeners") return `${hours(u.minutes || 0)} · ${s(u.episodes, "episode", "episodes")} · ${s(u.finishes, "finished", "finished")}`;
  if (crowd === "critics") return `${s(u.reviews, "review", "reviews")} · ${n(u.thumbs)} thumbs up and + · ${s(u.replies_got, "reply", "replies")} to them`;
  if (crowd === "connectors") return `${s(u.invited, "invite joined", "invites joined")} · ${n(u.sends_played)} of ${s(u.sends, "send", "sends")} played · ${s(u.shares, "share", "shares")}`;
  return `here ${s(u.days_active, "day", "days")} · ${hours(u.minutes || 0)} listening${u.app_minutes ? ` · ${hours(u.app_minutes)} in the app` : ""} · ${n(u.logs)} logs · ${n(u.reviews)} reviews · ${n(u.replies)} replies`;
}

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
      {title ? <h2 className="stats-h">{title}</h2> : null}
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
  const [crowd, setCrowd] = useState("active");
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

          <h2 className="stats-h">Coming back</h2>
          <div className="stats-tiles">
            <Tile
              label="Daily habit"
              value={s.habit?.monthly ? `${Math.round((100 * Number(s.habit.daily || 0)) / s.habit.monthly)}%` : "–"}
              note={`${Math.round(Number(s.habit?.daily || 0))} people on an average day, of ${n(s.habit?.monthly)} this month`}
            />
          </div>
          <table className="stats-table">
            <thead>
              <tr><th>Signed up, week of</th><th>People</th><th>Back week 2</th><th>Back week 5</th></tr>
            </thead>
            <tbody>
              {(s.cohorts || []).map((c) => (
                <tr key={c.week}>
                  <td>{fmtDay(c.week)}</td>
                  <td>{n(c.people)}</td>
                  <td>{c.week2 == null ? <span className="muted">too soon</span> : pct(c.week2, c.people)}</td>
                  <td>{c.week5 == null ? <span className="muted">too soon</span> : pct(c.week5, c.people)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small stats-note">Back = did anything on Hooked 7–13 days (week 2) or 28–34 days (week 5) after signing up.</p>

          <h2 className="stats-h">First week of new people</h2>
          {s.funnel?.signed_up ? (
            <div className="stats-funnel">
              {FUNNEL.map((f) => (
                <div key={f.key} className="stats-funnel__row">
                  <div className="stats-funnel__label">{f.label}</div>
                  <div className="stats-funnel__track">
                    <div className="stats-funnel__bar" style={{ width: `${(100 * (s.funnel[f.key] || 0)) / s.funnel.signed_up}%` }} />
                  </div>
                  <div className="stats-funnel__num">{pct(s.funnel[f.key], s.funnel.signed_up)}</div>
                </div>
              ))}
              <p className="muted small stats-note">
                {n(s.funnel.signed_up)} people who signed up in these days (at least a day ago). Follows made for them (the team, whoever invited them) don&rsquo;t count.
              </p>
            </div>
          ) : (
            <p className="muted small">No new people in these days yet.</p>
          )}

          <TopList
            title="Where plays start"
            rows={s.sources}
            render={(x) => (
              <>
                <span className="stats-list__title">{SOURCES[x.source] || x.source}</span>
                <div className="stats-list__nums">
                  {n(x.plays)} plays · {hours(x.minutes || 0)} · {pct(x.finishes, x.plays)} finished
                </div>
              </>
            )}
          />

          <h2 className="stats-h">Superusers</h2>
          <div className="stats-ranges stats-ranges--wrap" role="group" aria-label="Which superusers">
            {CROWDS.map((c) => (
              <button key={c.key} type="button" className={`chip chip--sm${c.key === crowd ? " chip--on" : ""}`} onClick={() => setCrowd(c.key)}>
                {c.label}
              </button>
            ))}
          </div>
          <p className="muted small stats-note">{CROWDS.find((c) => c.key === crowd)?.note}</p>
          <TopList
            rows={crowd === "active" ? s.top_people : s[crowd]}
            render={(u) => (
              <>
                <Link href={`/u/${u.handle}`} className="stats-list__title">@{u.handle}</Link>
                {u.display_name ? <span className="muted"> · {u.display_name}</span> : null}
                <div className="stats-list__nums">{crowdLine(crowd, u)}</div>
              </>
            )}
          />

          <h2 className="stats-h">Word of mouth</h2>
          <div className="stats-tiles">
            <Tile label="Sends" value={n(s.word_of_mouth?.sends)} />
            <Tile label="Then played" value={pct(s.word_of_mouth?.played, s.word_of_mouth?.sends)} note="of sends" />
            <Tile label="Then logged" value={pct(s.word_of_mouth?.logged, s.word_of_mouth?.sends)} note="of sends" />
            <Tile label="Shares outside Hooked" value={n(p.shares)} />
          </div>

          <TopList
            title="Taste: top categories"
            rows={s.categories}
            render={(c) => (
              <>
                <span className="stats-list__title">{c.category}</span>
                <span className="stats-list__nums"> · {hours(c.minutes || 0)} · {n(c.people)} {c.people === 1 ? "person" : "people"}</span>
              </>
            )}
          />
          <TopList
            title="Where people are"
            rows={s.countries}
            empty="No answers yet."
            render={(c) => (
              <>
                <span className="stats-list__title">{countryName(c.country)}</span>
                <span className="stats-list__nums"> · {n(c.people)} people, {n(c.listeners)} listening in Hooked</span>
                {c.categories?.length ? <div className="stats-list__nums">Likes {c.categories.join(", ")}</div> : null}
              </>
            )}
          />
          <TopList
            title="Top cities"
            rows={s.cities}
            empty="No answers yet."
            render={(c) => (
              <>
                <span className="stats-list__title">{c.place}</span>
                <span className="stats-list__nums"> · {n(c.people)}</span>
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
