// Where to send someone after signing in (?next=…): only a page on Hooked itself. A plain "starts with /" check isn't
// enough: browsers read "/\evil.com" (and "/<tab>/evil.com") as another website (security fix, 2026-11-26).
export function safePath(next, fallback = "/me") {
  if (typeof next !== "string" || !next.startsWith("/") || /[\\\x00-\x1f\x7f]/.test(next)) return fallback;
  try {
    const u = new URL(next, "https://hookedonpods.invalid");
    if (u.origin !== "https://hookedonpods.invalid") return fallback;
    return u.pathname + u.search + u.hash;
  } catch {
    return fallback;
  }
}

// A link from a podcast feed (the show's or episode's website): only plain web addresses.
export function webLink(url) {
  return typeof url === "string" && /^https?:\/\//i.test(url.trim()) ? url.trim() : null;
}
