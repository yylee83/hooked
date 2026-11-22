// The link preview images' addresses, built the same way by the pages' link details and by the share buttons, so an
// early fetch from a share button warms the very address Messages will ask for. (Safe to use in the browser.)
export const episodePreviewPath = (id, from) =>
  `/api/og/episode?${new URLSearchParams({ id: String(id), ...(from ? { from } : {}) })}`;
export const briefPreviewPath = (key) => `/api/og/brief?${new URLSearchParams({ b: String(key) })}`;

// Ask for a preview image in the background so it's drawn and stored before someone shares the link.
export function warmPreview(path) {
  if (typeof window === "undefined" || !path) return;
  try {
    fetch(path, { priority: "low" }).catch(() => {});
  } catch {}
}
