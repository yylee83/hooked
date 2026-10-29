// Small helpers for clips (used by both the server and the browser).

// 754 → "12:34", 3723 → "1:02:03"
export function clock(sec = 0) {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}

export function clipSeconds(clips = []) {
  return clips.reduce((sum, c) => sum + Math.max(0, c.end - c.start), 0);
}

// Total listening time for a brief: clips where we have them, whole episodes otherwise.
export function briefSeconds(items = [], mode = "clips") {
  return items.reduce((sum, it) => {
    if (mode === "clips" && it.clips?.length) return sum + clipSeconds(it.clips);
    return sum + (it.duration || 0);
  }, 0);
}

// Turn a brief into a play queue of segments.
export function briefQueue(items = [], mode = "clips") {
  const segs = [];
  for (const it of items) {
    if (!it.audio) continue;
    const ep = {
      id: it.episodeId,
      title: it.episode,
      feedId: it.feedId,
      feedTitle: it.show,
      image: it.image,
      audio: it.audio,
      duration: it.duration,
    };
    if (mode === "clips" && it.clips?.length) for (const c of it.clips) segs.push({ ep, start: c.start, end: c.end });
    else segs.push({ ep, start: 0, end: it.duration || null });
  }
  return segs;
}
