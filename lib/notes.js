// Show notes from podcast feeds are written by anyone, so we never put their HTML on our pages.
// We keep paragraph breaks as plain text, keep each linked phrase as "[words](https://address)",
// and turn web addresses into links ourselves. Only http(s) addresses ever become links.

const decode = (s = "") =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;|&apos;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&lt;/g, "‹")
    .replace(/&gt;/g, "›")
    .replace(/&(?!amp;)[a-z]+;/g, " ")
    .replace(/&amp;/g, "&");

const bare = (u) => u.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");

/** HTML (or plain text) → up to 30 plain-text paragraphs, with linked phrases kept as [words](url). */
export function notesToParagraphs(html = "") {
  return String(html)
    // <a href="https://…">words</a> → [words](https://…). Other kinds of links are dropped to their words.
    .replace(/<a\b[^>]*?\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi, (_, __, href, inner) => {
      const words = decode(inner.replace(/<[^>]+>/g, "")).replace(/[\[\]]/g, "").replace(/\s+/g, " ").trim();
      const url = decode(href).trim();
      if (!/^https?:\/\/[^\s()]+$/i.test(url)) return words;
      if (!words || bare(words) === bare(url)) return url;
      return `[${words}](${url})`;
    })
    .replace(/<\/(p|div|li|h\d)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .split(/\n+/)
    .map((p) => decode(p).replace(/[⁠​]/g, "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 30);
}

// In order: a linked phrase, a full web address, or a bare one like pivotshow.com.
const TLDS = "com|org|net|co|fm|io|me|tv|us|uk|ca|au|show|news|ly|link|app|so|social|xyz|info";
const LINK_RE = new RegExp(
  String.raw`\[([^\]]{1,200})\]\((https?:\/\/[^\s()]+)\)` +
  String.raw`|(https?:\/\/[^\s<>"'\]]+)` +
  String.raw`|(?<![@\w.\/-])((?:[a-z0-9-]+\.)+(?:${TLDS})(?:\/[^\s<>"']*)?)(?![\w@-])`,
  "gi"
);
const TRAIL = /[.,;:!?)\]'"]+$/;

/** One paragraph → pieces: plain text, or { href, text } for a link. */
export function linkPieces(text = "") {
  const out = [];
  let last = 0;
  for (const m of String(text).matchAll(LINK_RE)) {
    let [all, words, url, full, dom] = m;
    let tail = "";
    if (!words) {
      const raw = full || dom;
      const cut = raw.replace(TRAIL, "");
      tail = raw.slice(cut.length);
      url = full ? cut : `https://${cut}`;
      all = raw;
    }
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push({ href: url, text: words || bare(url) });
    if (tail) out.push(tail);
    last = m.index + all.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out.filter((p) => p !== "");
}
