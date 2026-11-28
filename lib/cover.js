// Podcast cover art is usually a huge file (3000×3000, often 1 to 7 MB each), but Hooked shows it at phone size.
// Home alone was loading 20+ MB of covers on a phone (2026-11-28). So covers go through wsrv.nl, a free image
// service (with Cloudflare's cache in front), which shrinks each one to the size we show it, as a small WebP.
// If the small copy fails, components/Art.js and CoverStack.js fall back to the original. Mentioned on /privacy.
const PROXY = "https://wsrv.nl/";
// A few fixed sizes (in image pixels, 3× the size on screen, to stay sharp on iPhone's 3× screens) so the same cover is shared from the cache.
const SIZES = [96, 160, 240, 320, 480, 600];

export function smallCover(src, shownPx = 200) {
  if (typeof src !== "string" || !/^https?:\/\//i.test(src) || src.startsWith(PROXY)) return src;
  const want = Math.ceil((Number(shownPx) || 200) * 3);
  const w = SIZES.find((s) => s >= want) || SIZES[SIZES.length - 1];
  return `${PROXY}?url=${encodeURIComponent(src)}&w=${w}&h=${w}&fit=cover&we&output=webp&q=80`;
}
