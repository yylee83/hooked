// The link preview images' addresses, built the same way by the pages' link details and by the share buttons, so an
// early fetch from a share button warms the very address Messages will ask for. (Safe to use in the browser.)
// `review` is the sharer's rating and "What's the hook?" line. Each version of it gets its own address (`v`), so after
// a new or changed review, Messages and Vercel ask for a fresh picture instead of reusing the old one.
export const episodePreviewPath = (id, from, review) => {
  const v = from ? reviewVersion(review) : "";
  return `/api/og/episode?${new URLSearchParams({ id: String(id), ...(from ? { from } : {}), ...(v ? { v } : {}) })}`;
};

// A short fingerprint of a review: the same review always gives the same one. Empty when there's nothing to show.
export function reviewVersion(review) {
  const rating = Number(review?.rating) || 0;
  const hook = String(review?.hook || "").trim();
  if (!rating && !hook) return "";
  let h = 2166136261;
  for (const ch of `${rating}|${hook}`) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0;
  return h.toString(36);
}
export const briefPreviewPath = (key) => `/api/og/brief?${new URLSearchParams({ b: String(key) })}`;

// Ask for a preview image in the background so it's drawn and stored before someone shares the link.
export function warmPreview(path) {
  if (typeof window === "undefined" || !path) return;
  try {
    fetch(path, { priority: "low" }).catch(() => {});
  } catch {}
}
