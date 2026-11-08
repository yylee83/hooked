// Search's People and Briefs sections: Hooked accounts and Briefs that match the words. Both are public, so
// the server reads them directly (no sign-in needed).
import "server-only";
import { publicDb } from "@/lib/supabase/public";
import { briefs as curated } from "@/lib/briefs";
import { norm, rankResults } from "@/lib/rank";

const BRIEFS_READ = 300; // listener briefs read at once, then ranked here (there aren't many yet)

/** People whose handle or display name matches. `exact` = someone's handle or name is exactly the words. */
export async function searchPeople(query, limit = 3) {
  const db = publicDb();
  const term = String(query || "").trim().replace(/^@/, "").replace(/[%_,()]/g, " ").trim();
  if (!db || term.length < 2) return { people: [], exact: false, more: false };
  const { data } = await db
    .from("profiles")
    .select("id, handle, display_name")
    .not("handle", "is", null)
    .or(`handle.ilike.%${term}%,display_name.ilike.%${term}%`)
    .limit(limit * 4);
  const t = norm(term);
  const isExact = (p) => norm(p.handle) === t || norm(p.display_name || "") === t;
  const starts = (p) => norm(p.handle).startsWith(t) || norm(p.display_name || "").startsWith(t);
  const people = (data || []).sort((a, b) => isExact(b) - isExact(a) || starts(b) - starts(a));
  return { people: people.slice(0, limit), exact: people.some(isExact), more: people.length > limit };
}

/** Briefs (built-in and made by listeners) whose title, topic, description or episodes match. */
export async function searchBriefs(query, limit = 3) {
  const db = publicDb();
  const { data } = db
    ? await db
        .from("briefs")
        .select("id, title, dek, topic, color, mode, total_seconds, items, created_at, author:profiles!briefs_author_id_fkey(handle)")
        .order("created_at", { ascending: false })
        .limit(BRIEFS_READ)
    : { data: [] };
  const all = [
    ...curated.map((b) => ({
      href: `/briefs/${b.slug}`,
      title: b.title,
      dek: (b.dek || "").replace(/\*/g, ""),
      topic: b.topic,
      color: b.color,
      shows: b.items.length,
      meta: b.meta,
      itemText: b.items.map((it) => `${it.show} ${it.episode} ${it.angle || ""}`).join(" · "),
    })),
    ...(data || []).map((b) => ({
      href: `/briefs/b/${b.id}`,
      title: b.title,
      dek: b.dek || "",
      topic: b.topic,
      color: b.color,
      shows: (b.items || []).length,
      seconds: b.total_seconds,
      mode: b.mode,
      author: b.author?.handle || null,
      image: (b.items || []).find((it) => it.image)?.image || null,
      itemText: (b.items || []).map((it) => `${it.show || ""} ${it.episode || ""}`).join(" · "),
    })),
  ];
  const fields = (b) => [
    { text: b.title, weight: 3 },
    { text: b.topic, weight: 2.5 },
    { text: b.dek, weight: 1.5 },
    { text: b.itemText, weight: 1 },
  ];
  const ranked = rankResults(query, all, fields);
  return { briefs: ranked.slice(0, limit), total: ranked.length };
}
