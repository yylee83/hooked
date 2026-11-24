// Shared pieces of the link preview images (/api/og/episode, /api/og/brief).
//
// Phones are impatient: when you share from an iPhone, Messages fetches the preview image itself and gives up after a
// few seconds, showing only a small app icon. So these images are kept small and quick: covers are shrunk before
// drawing, the finished picture is sent as a JPEG (a few dozen KB rather than several hundred), and it's kept on
// Vercel's servers for a day so a second fetch is instant. Share buttons also ask for it early (warmPreview in
// components/Share.js), so it's ready before Messages asks.
import { readFile } from "fs/promises";
import { join } from "path";
import sharp from "sharp";
import { safeFetch } from "@/lib/safe-fetch";

let fonts;
export async function loadFonts() {
  if (!fonts) {
    const dir = join(process.cwd(), "assets");
    const [bagel, medium, bold] = await Promise.all([
      readFile(join(dir, "BagelFatOne.woff")),
      readFile(join(dir, "Geist-Medium.ttf")),
      readFile(join(dir, "Geist-Bold.ttf")),
    ]);
    fonts = [
      { name: "Bagel", data: bagel, weight: 400, style: "normal" },
      { name: "Geist", data: medium, weight: 500, style: "normal" },
      { name: "Geist", data: bold, weight: 700, style: "normal" },
    ];
  }
  return fonts;
}

// A cover, shrunk to `size` pixels square, ready to draw. Feed covers are often 3000px and a few MB, which made the
// preview slow to draw and heavy to download. The address comes from a podcast feed, so it goes through safeFetch.
// A slow or broken cover is just left out.
export async function coverDataUrl(url, size = 400) {
  if (!url || !/^https?:\/\//.test(url)) return null;
  try {
    const res = await safeFetch(url, { timeoutMs: 3000, maxBytes: 6_000_000 });
    const type = res.headers.get("content-type") || "";
    if (!res.ok || !/^image\//.test(type)) return null;
    const jpg = await sharp(res.body, { failOn: "none" })
      .rotate()
      .resize(size, size, { fit: "cover" })
      .flatten({ background: "#FFF7EE" })
      .jpeg({ quality: 85 })
      .toBuffer();
    return `data:image/jpeg;base64,${jpg.toString("base64")}`;
  } catch (e) {
    console.warn("[og] cover left out:", e?.message);
    return null;
  }
}

// Kept for an hour on the phone and a day on Vercel's servers; after that the old one is shown while a fresh one is
// drawn, so nobody waits.
const CACHE = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";

// Turn a drawn preview (an ImageResponse, which is a PNG) into a small JPEG. If that fails, send the PNG.
export async function asJpeg(imageResponse) {
  const png = Buffer.from(await imageResponse.arrayBuffer());
  try {
    const jpg = await sharp(png).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
    return new Response(jpg, { headers: { "Content-Type": "image/jpeg", "Content-Length": String(jpg.length), "Cache-Control": CACHE } });
  } catch {
    return new Response(png, { headers: { "Content-Type": "image/png", "Cache-Control": CACHE } });
  }
}
