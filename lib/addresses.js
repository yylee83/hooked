// Page addresses. Episodes and shows have short ids like "k3x9q2ab" (see lib/catalog.js).
// Old addresses with Podcast Index numbers redirect to the short ones, keeping ?from= and the rest.

/** Rebuild the query string from a page's searchParams. */
export function withQuery(path, searchParams = {}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams || {})) {
    for (const one of Array.isArray(v) ? v : [v]) if (typeof one === "string") q.append(k, one);
  }
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}
