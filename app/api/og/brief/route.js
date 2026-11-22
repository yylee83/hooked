// The preview image for a shared brief link: the brief's title, a fan of its covers, and who made it.
import { ImageResponse } from "next/og";
import { briefShareInfo, countText } from "@/lib/brief-share";
import { asJpeg, coverDataUrl, loadFonts } from "@/lib/og-image";

const C = { cobalt: "#2340FF", pink: "#FF7AC6", butter: "#FFE14D", ink: "#15131D", cream: "#FFF7EE" };
// Background and text for each brief color, like the brief page.
const TONE = {
  cobalt: { bg: C.cobalt, fg: "#FFFFFF", accent: C.butter },
  bubblegum: { bg: C.pink, fg: C.ink, accent: C.ink },
  butter: { bg: C.butter, fg: C.ink, accent: C.cobalt },
};

const clip = (s = "", n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
const KEY = /^([0-9a-f-]{36}|[a-z0-9-]{1,60})$/i;
const FAN = [
  { left: 0, top: 70, rotate: -8 },
  { left: 110, top: 20, rotate: 3 },
  { left: 220, top: 80, rotate: -2 },
  { left: 300, top: 10, rotate: 7 },
];

export async function GET(request) {
  const key = new URL(request.url).searchParams.get("b") || "";
  if (!KEY.test(key)) return new Response("Not found", { status: 404 });
  const [info, f] = await Promise.all([briefShareInfo(key).catch(() => null), loadFonts()]);
  if (!info) return new Response("Not found", { status: 404 });
  const tone = TONE[info.color] || TONE.cobalt;
  const covers = (await Promise.all(info.covers.slice(0, 4).map((u) => coverDataUrl(u, 240)))).filter(Boolean);
  const line = info.author ? `${countText(info.count)} · picked by @${info.author}` : countText(info.count);

  return asJpeg(
    new ImageResponse(
    (
      <div style={{ width: 1200, height: 630, display: "flex", background: tone.bg, fontFamily: "Geist", color: tone.fg, padding: "56px 64px", position: "relative" }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, paddingRight: 40 }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <div style={{ display: "flex", fontFamily: "Bagel", fontSize: 44, color: tone.fg, lineHeight: 1 }}>hooked</div>
            <div style={{ display: "flex", marginLeft: 18, fontSize: 24, fontWeight: 700, background: C.butter, color: C.ink, border: `4px solid ${C.ink}`, borderRadius: 999, padding: "4px 18px", transform: "rotate(-4deg)" }}>
              Brief
            </div>
          </div>
          <div style={{ display: "flex", fontFamily: "Bagel", fontSize: info.title.length > 28 ? 64 : 80, lineHeight: 1.02, marginTop: 44 }}>{clip(info.title, 60)}</div>
          {info.dek && <div style={{ display: "flex", fontSize: 30, fontWeight: 500, lineHeight: 1.3, marginTop: 20 }}>{clip(info.dek, 90)}</div>}
          <div style={{ display: "flex", fontSize: 26, fontWeight: 700, color: tone.accent, marginTop: "auto" }}>{line}</div>
        </div>

        {covers.length > 0 && (
          <div style={{ display: "flex", position: "relative", width: 520, height: 518 }}>
            {covers.map((src, i) => {
              const spot = FAN[covers.length === 1 ? 1 : i];
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    position: "absolute",
                    left: spot.left,
                    top: spot.top + 90,
                    width: 230,
                    height: 230,
                    borderRadius: 28,
                    border: `5px solid ${C.ink}`,
                    boxShadow: `9px 9px 0 ${C.ink}`,
                    transform: `rotate(${spot.rotate}deg)`,
                    overflow: "hidden",
                    background: C.cream,
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} width={230} height={230} style={{ objectFit: "cover" }} alt="" />
                </div>
              );
            })}
          </div>
        )}
      </div>
    ),
    { width: 1200, height: 630, fonts: f }
    )
  );
}
