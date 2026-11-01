// Fetch a URL that came from outside: a pasted link, or an image/transcript address from a podcast feed.
// Anyone can put any address in a feed, so before every request (and every redirect) we check that
// the address is a normal public website, not something inside a private network. We also cap the
// time, the number of redirects and the size of what we download.
import "server-only";
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

// Only for local testing against mock servers on this machine. Never set it on Vercel.
const ALLOW_PRIVATE = process.env.SAFE_FETCH_ALLOW_PRIVATE === "1";

export class UnsafeUrlError extends Error {}

// Addresses that aren't the public internet. Node's BlockList understands every way of writing an
// address, including IPv6 spellings of IPv4 ones like "::ffff:7f00:1" (that's 127.0.0.1).
const blocked = new BlockList();
for (const [net, bits] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], // incl. cloud metadata
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 3], // multicast and reserved, up to 255.255.255.255
]) blocked.addSubnet(net, bits, "ipv4");
for (const [net, bits] of [
  ["::", 128], ["::1", 128], ["64:ff9b::", 96], ["64:ff9b:1::", 48], ["100::", 64], ["2001:db8::", 32],
  ["fc00::", 7], ["fe80::", 10], ["ff00::", 8],
]) blocked.addSubnet(net, bits, "ipv6");

/** True if this IP address is private, internal or otherwise not a public website. */
export function isPrivateIp(ip) {
  const v = isIP(ip);
  if (!v) return true;
  return blocked.check(ip, v === 4 ? "ipv4" : "ipv6");
}

/** Throws UnsafeUrlError unless `raw` is an http(s) address on the public internet. Returns the URL. */
export async function checkUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError("Not a valid address");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new UnsafeUrlError("Only web addresses are allowed");
  if (url.username || url.password) throw new UnsafeUrlError("Addresses with logins aren't allowed");
  if (url.port && url.port !== "80" && url.port !== "443") throw new UnsafeUrlError("Unusual port");
  if (ALLOW_PRIVATE) return url;

  const host = url.hostname.replace(/^\[|\]$/g, "");
  const ips = isIP(host) ? [host] : (await lookup(host, { all: true, verbatim: true }).catch(() => [])).map((r) => r.address);
  if (!ips.length) throw new UnsafeUrlError("Address not found");
  if (ips.some(isPrivateIp)) throw new UnsafeUrlError("Private address");
  return url;
}

/**
 * Like fetch, but safe for addresses that came from outside.
 * Returns { ok, status, url, headers, body } where body is a Buffer of at most `maxBytes`.
 * Throws UnsafeUrlError for blocked addresses, and an Error for timeouts or oversized responses.
 *
 * @param {string} raw
 * @param {{ timeoutMs?: number, maxBytes?: number, maxRedirects?: number, headers?: Record<string,string>, readBody?: boolean, next?: object }} [opts]
 */
export async function safeFetch(raw, { timeoutMs = 6000, maxBytes = 2_000_000, maxRedirects = 3, headers, readBody = true, next } = {}) {
  const signal = AbortSignal.timeout(timeoutMs);
  let url = await checkUrl(raw);
  for (let hop = 0; ; hop++) {
    const res = await fetch(url, { redirect: "manual", signal, headers, ...(next ? { next } : {}) });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      await res.body?.cancel();
      if (hop >= maxRedirects) throw new Error("Too many redirects");
      url = await checkUrl(new URL(location, url).href);
      continue;
    }
    if (!readBody) {
      await res.body?.cancel();
      return { ok: res.ok, status: res.status, url: url.href, headers: res.headers, body: Buffer.alloc(0) };
    }
    const declared = Number(res.headers.get("content-length") || 0);
    if (declared > maxBytes) {
      await res.body?.cancel();
      throw new Error("Response too large");
    }
    // Read in pieces and stop as soon as it's too big, rather than trusting content-length.
    const chunks = [];
    let size = 0;
    if (res.body) {
      for await (const chunk of res.body) {
        size += chunk.byteLength;
        if (size > maxBytes) throw new Error("Response too large");
        chunks.push(chunk);
      }
    }
    return { ok: res.ok, status: res.status, url: url.href, headers: res.headers, body: Buffer.concat(chunks) };
  }
}
