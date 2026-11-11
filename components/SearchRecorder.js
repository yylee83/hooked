"use client";
// Search history (lib/history.js): saves each search once, and the first result tapped in the results area
// (`[data-search-results]`) with its position. Shows nothing. Signed-out searches aren't saved.
import { useEffect, useRef } from "react";
import { recordSearch, recordSearchTap } from "@/lib/history";
import { useStore } from "@/lib/store";

const KINDS = [
  [/^\/episode\/([^/?#]+)/, "episode"],
  [/^\/show\/(?:apple\/)?([^/?#]+)/, "show"],
  [/^\/u\/([^/?#]+)/, "person"],
  [/^\/briefs\/b\/([^/?#]+)/, "brief"],
];
const kindOf = (path) => {
  for (const [re, kind] of KINDS) {
    const m = path.match(re);
    if (m) return { kind, ref: decodeURIComponent(m[1]) };
  }
  return null;
};

export default function SearchRecorder({ query, filter, shows = 0, episodes = 0, people = 0, briefs = 0 }) {
  const signedIn = !!useStore()?.user;
  const id = useRef(null);
  const tapped = useRef(false);

  // Once per search (words + filter). "Load more" keeps the same search.
  useEffect(() => {
    if (!signedIn || !query) return;
    id.current = recordSearch({ query, filter, shows, episodes, people, briefs });
    tapped.current = false;
  }, [signedIn, query, filter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onClick = (e) => {
      if (!id.current || tapped.current) return;
      const a = e.target.closest?.("a[href]");
      const area = a?.closest("[data-search-results]");
      if (!area) return;
      const path = new URL(a.href, location.href).pathname;
      const hit = kindOf(path);
      if (!hit) return;
      // Position: counting each result once, in page order (a row can hold more than one link).
      const order = [];
      for (const link of area.querySelectorAll("a[href]")) {
        const p = new URL(link.href, location.href).pathname;
        if (kindOf(p) && !order.includes(p)) order.push(p);
      }
      tapped.current = true;
      recordSearchTap(id.current, hit.kind, hit.ref, order.indexOf(path) + 1);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
