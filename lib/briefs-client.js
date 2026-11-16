"use client";
// Your briefs, from the browser: list them, add an episode to one, or start a draft with one ("+ Brief" on an
// episode page, components/AddToBrief.js). A draft is a brief only you can see until you publish it
// (the `draft` column; components/BriefBuilder.js saves drafts as you go).
import { supabase } from "@/lib/supabase/client";
import { briefSeconds } from "@/lib/clips";
import { refreshCatalog } from "@/lib/catalog-client";

export const MAX_ITEMS = 12;
export const UNTITLED = "Untitled brief";

// One item as it's saved in briefs.items. Our ids go with it; the database fills them in from Podcast Index numbers.
export function savedItem(x, mode) {
  return {
    ...(x.episodeRef ? { episodeRef: x.episodeRef } : {}),
    ...(x.showRef ? { showRef: x.showRef } : {}),
    ...(x.episodeId != null ? { episodeId: x.episodeId } : {}),
    ...(x.feedId != null ? { feedId: x.feedId } : {}),
    show: x.show,
    episode: x.episode,
    image: x.image,
    audio: x.audio,
    duration: x.duration,
    transcript: x.transcript,
    clips: mode === "clips" ? x.clips : null,
  };
}

const sameItem = (a, b) => (!!a.episodeRef && a.episodeRef === b.episodeRef) || (a.episodeId != null && String(a.episodeId) === String(b.episodeId));

/** Is this episode ({ ref, id }) already in the brief? */
export const inBrief = (brief, ep) => (brief.items || []).some((it) => sameItem(it, { episodeRef: ep.ref, episodeId: ep.id }));

/** Your briefs, drafts first, then newest. Works before the `draft` column exists (everything counts as published). */
export async function myBriefs(userId) {
  const { data, error } = await supabase().from("briefs").select("*").eq("author_id", userId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).sort((a, b) => !!b.draft - !!a.draft);
}

// The episode as a brief item, cut to the topic when the brief is "just the parts" and its transcript allows.
async function itemFor(ep, topic, mode) {
  const key = ep.ref || ep.id;
  const res = await fetch(`/api/briefs/add?${new URLSearchParams({ episode: String(key), topic: topic || "", mode })}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.item) throw new Error(data.error || "We couldn't load that episode.");
  return data.item;
}

/** Add the episode to the end of one of your briefs. Returns the updated brief. */
export async function addToBrief(brief, ep) {
  if (inBrief(brief, ep)) return brief;
  if ((brief.items || []).length >= MAX_ITEMS) throw new Error(`A brief can hold ${MAX_ITEMS} episodes. Remove one first.`);
  const item = await itemFor(ep, brief.topic, brief.mode);
  const items = [...(brief.items || []), savedItem(item, brief.mode)];
  const total_seconds = Math.round(briefSeconds(items, brief.mode));
  const { data, error } = await supabase().from("briefs").update({ items, total_seconds }).eq("id", brief.id).select("*").single();
  if (error) throw error;
  if (item.episodeId != null) refreshCatalog({ episodeId: item.episodeId });
  return data;
}

/** A new draft with just this episode in it (whole episodes, until you give it a topic). Returns the draft. */
export async function startDraft(ep) {
  const item = await itemFor(ep, "", "full");
  const items = [savedItem(item, "full")];
  const row = { draft: true, title: UNTITLED, topic: "", mode: "full", color: "cobalt", items, total_seconds: Math.round(briefSeconds(items, "full")) };
  const { data, error } = await supabase().from("briefs").insert(row).select("*").single();
  if (error) throw error;
  return data;
}
