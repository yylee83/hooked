// Hooked's service worker. It does only two things, and leaves every other request alone:
//  1. /downloads/audio/<id> is answered from the episode you downloaded (lib/downloads.js), with the byte ranges
//     iPhone Safari asks for. If the saved copy is gone, the player is sent to the original stream (?u=).
//  2. A page that can't load because there's no signal shows /offline.html, which plays your downloads.
const SHELL = "hooked-shell-v1";
const DOWNLOADS = "hooked-downloads-v1";
const OFFLINE = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.add(new Request(OFFLINE, { cache: "reload" }))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("hooked-shell-") && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/downloads/audio/")) {
    event.respondWith(savedAudio(req, url));
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(async () => (await caches.match(OFFLINE, { cacheName: SHELL })) || Response.error())
    );
  }
});

async function savedAudio(req, url) {
  const cache = await caches.open(DOWNLOADS);
  const saved = await cache.match(url.pathname);
  if (!saved) {
    const original = url.searchParams.get("u");
    return /^https?:\/\//.test(original || "") ? Response.redirect(original, 302) : new Response("Not downloaded", { status: 404 });
  }
  const blob = await saved.blob();
  const type = saved.headers.get("Content-Type") || "audio/mpeg";
  const size = blob.size;
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("Range") || "");
  if (!range) {
    return new Response(blob, { status: 200, headers: { "Content-Type": type, "Content-Length": String(size), "Accept-Ranges": "bytes" } });
  }
  let start = range[1] === "" ? NaN : Number(range[1]);
  let end = range[2] === "" ? size - 1 : Number(range[2]);
  if (Number.isNaN(start)) {
    // "bytes=-500": the last 500 bytes.
    start = Math.max(0, size - end);
    end = size - 1;
  }
  end = Math.min(end, size - 1);
  if (start >= size || start > end) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }
  return new Response(blob.slice(start, end + 1, type), {
    status: 206,
    headers: {
      "Content-Type": type,
      "Content-Length": String(end - start + 1),
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Accept-Ranges": "bytes",
    },
  });
}
