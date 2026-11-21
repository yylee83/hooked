// Apple episode links carry the start of the episode's title as words ("89-enneagram-what-does-your-number-say-
// about-you-with"). Compare letters and digits only, so punctuation, apostrophes and accents don't matter.
const compact = (s = "") =>
  String(s)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");

/** True if this title starts with the words of the link. Short or generic link words ("episode") never match. */
export function slugMatch(title, slug) {
  const s = compact(slug);
  return s.length >= 12 && compact(title).startsWith(s);
}
