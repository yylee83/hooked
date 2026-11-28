// Makes the Home Screen app pictures: the app icons and the iPhone splash screens (the picture shown while Hooked
// opens from the Home Screen). Run after changing the look: `node scripts/make-app-icons.mjs`. Needs Playwright's
// Chromium (draws the pictures) and `npm install` (for the Bagel Fat One font).
//
//   app/apple-icon.png            180×180, the iPhone Home Screen icon (iPhone rounds the corners itself)
//   public/icons/icon-192.png     Android and the app manifest
//   public/icons/icon-512.png
//   public/icons/maskable-512.png the same with more room around it, for phones that cut icons into circles
//   public/splash/*.png           one per iPhone screen size, listed in lib/app-splash.js
import { readFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SPLASH_SCREENS } from "../lib/app-splash.js";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const font = readFileSync(
  join(root, "node_modules/@fontsource/bagel-fat-one/files/bagel-fat-one-latin-400-normal.woff2"),
).toString("base64");

const COBALT = "#2340FF";
const PINK = "#FF7AC6";
const BUTTER = "#FFE14D";
const INK = "#15131D";
const CREAM = "#FFF7EE";

// The playhead from the wordmark: a white track, pink up to the knob, a yellow knob. `w` sizes it; `width` is the
// track's width (a number of pixels, or "100%" to match the word above it).
function playhead(w, width = `${w}px`) {
  const h = w * 0.2;
  const knob = h * 1.9;
  const line = Math.max(2, w * 0.055);
  return `
    <div style="position:relative;width:${width};height:${h}px;border:${line}px solid ${INK};border-radius:999px;background:#fff;box-sizing:border-box">
      <div style="position:absolute;left:0;top:0;bottom:0;width:34%;background:${PINK};border-radius:999px 0 0 999px"></div>
      <div style="position:absolute;top:50%;left:34%;width:${knob}px;height:${knob}px;transform:translate(-50%,-50%);border:${line}px solid ${INK};border-radius:50%;background:${BUTTER};box-sizing:border-box"></div>
    </div>`;
}

// The icon: cobalt to the edges (the phone adds its own rounded corners), the playhead across the middle.
// `room` is how much of the width the playhead uses.
function iconHtml(size, room) {
  return `<div id="shot" style="width:${size}px;height:${size}px;background:${COBALT};display:flex;align-items:center;justify-content:center">
    ${playhead(size * room)}
  </div>`;
}

// The splash: cream, with the wordmark ("hooked" over the playhead) in the middle.
function splashHtml(w, h, scale) {
  const word = 64 * scale;
  return `<div id="shot" style="width:${w}px;height:${h}px;background:${CREAM};display:flex;align-items:center;justify-content:center">
    <div style="display:flex;flex-direction:column;gap:${word * 0.14}px;align-items:stretch">
      <span style="font-family:Bagel;color:${COBALT};font-size:${word}px;line-height:.85;letter-spacing:-.02em">hooked</span>
      ${playhead(word * 1.36, "100%")}
    </div>
  </div>`;
}

const page_ = (body) => `<!doctype html><html><head><style>
  @font-face { font-family: Bagel; src: url(data:font/woff2;base64,${font}) format("woff2"); }
  html, body { margin: 0; padding: 0; }
</style></head><body>${body}</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

async function shoot(html, w, h, file) {
  await page.setViewportSize({ width: Math.ceil(w), height: Math.ceil(h) });
  await page.setContent(page_(html));
  await page.evaluate(() => document.fonts.ready);
  mkdirSync(dirname(file), { recursive: true });
  await page.locator("#shot").screenshot({ path: file });
  console.log("made", file.replace(root + "/", ""));
}

await shoot(iconHtml(180, 0.66), 180, 180, join(root, "app/apple-icon.png"));
await shoot(iconHtml(192, 0.66), 192, 192, join(root, "public/icons/icon-192.png"));
await shoot(iconHtml(512, 0.66), 512, 512, join(root, "public/icons/icon-512.png"));
await shoot(iconHtml(512, 0.5), 512, 512, join(root, "public/icons/maskable-512.png"));

for (const s of SPLASH_SCREENS) {
  const w = s.width * s.ratio;
  const h = s.height * s.ratio;
  await shoot(splashHtml(w, h, s.ratio), w, h, join(root, "public", s.file));
}

await browser.close();
