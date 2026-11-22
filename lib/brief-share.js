// What a shared brief link shows before anyone opens it: the title, a short line and a few covers.
// Used by the brief pages' link details and by the preview image (/api/og/brief).
import "server-only";
import { getBrief } from "./briefs";
import { curatedSummary } from "./briefs-server";
import { getUserBrief } from "./supabase/public";
import { site } from "./site";
import { briefPreviewPath } from "./og-paths";

const UUID = /^[0-9a-f-]{36}$/i;
const plain = (s = "") => s.replace(/\*/g, "").trim();

// `key` is a built-in brief's slug, or a listener brief's id.
export async function briefShareInfo(key) {
  if (UUID.test(key)) {
    const b = await getUserBrief(key);
    if (!b) return null;
    const items = (b.items || []).filter((it) => it.found !== false);
    return {
      title: b.title || "A brief",
      dek: plain(b.dek),
      count: items.length,
      covers: items.map((it) => it.image).filter(Boolean).slice(0, 4),
      author: b.author?.handle || null,
      color: b.color || "cobalt",
    };
  }
  const b = getBrief(key);
  if (!b) return null;
  const summary = await curatedSummary(key).catch(() => null);
  return {
    title: b.title,
    dek: plain(b.dek),
    count: summary?.shows || b.items.length,
    covers: summary?.covers || [],
    author: null,
    color: b.color || "cobalt",
  };
}

export const countText = (n) => `${n} ${n === 1 ? "episode" : "episodes"}`;

// Link details for a brief page: title, description and the preview image.
export async function briefMetadata(key) {
  const info = await briefShareInfo(key);
  if (!info) return { title: "Brief" };
  const title = `${info.title} · a brief on ${site.name}`;
  const description = [info.dek, `${countText(info.count)}${info.author ? `, picked by @${info.author}` : ""}. Listen free on ${site.name}.`]
    .filter(Boolean)
    .join(" ");
  const image = briefPreviewPath(key);
  return {
    title: info.title,
    description,
    openGraph: { title, description, images: [{ url: image, width: 1200, height: 630, type: "image/jpeg", alt: title }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}
