// Show notes from podcast feeds are written by anyone, so we never put their HTML on our pages.
// We keep the paragraph breaks as plain text, and turn web addresses into links ourselves.

/** HTML (or plain text) → up to 30 plain-text paragraphs. */
export function notesToParagraphs(html = "") {
  return String(html)
    .replace(/<\/(p|div|li|h\d)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&[a-z]+;/g, " ")
    .split(/\n+/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 30);
}

const URL_RE = /(https?:\/\/[^\s<>"']+)/g;

/** One paragraph → pieces: plain text, or { href } for a web address (trailing punctuation left out). */
export function linkPieces(text = "") {
  const out = [];
  for (const part of String(text).split(URL_RE)) {
    if (!part) continue;
    if (/^https?:\/\//.test(part)) {
      const href = part.replace(/[.,;:!?)\]]+$/, "");
      out.push({ href });
      if (href.length < part.length) out.push(part.slice(href.length));
    } else out.push(part);
  }
  return out;
}
