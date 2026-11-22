// The preview image for a shared episode link: the cover, the episode, and the sharer's take.
import { ImageResponse } from "next/og";
import { artOf } from "@/lib/podcastindex";
import { REF, loadEpisode } from "@/lib/catalog";
import { getSharedLog } from "@/lib/supabase/public";
import { asJpeg, coverDataUrl, loadFonts } from "@/lib/og-image";

const C = { cobalt: "#2340FF", pink: "#FF7AC6", butter: "#FFE14D", ink: "#15131D", cream: "#FFF7EE", muted: "#55526A" };

const clip = (s = "", n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
const STAR = "M12 2.5l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17.4l-6.1 3.5 1.5-6.8L2.2 9.5l6.9-.7z";

// Stars drawn as shapes (no font needed), with half stars.
function StarRow({ value, size = 36 }) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, value - i));
        return (
          <svg key={i} width={size} height={size} viewBox="0 0 24 24">
            <defs>
              <linearGradient id={`g${i}`} x1="0" x2="1" y1="0" y2="0">
                <stop offset={fill} stopColor={C.cobalt} />
                <stop offset={fill} stopColor="#FFFFFF" />
              </linearGradient>
            </defs>
            <path d={STAR} fill={`url(#g${i})`} stroke={C.cobalt} strokeWidth="1.6" strokeLinejoin="round" />
          </svg>
        );
      })}
    </div>
  );
}

export async function GET(request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id") || "";
  const from = url.searchParams.get("from") || "";
  // Our short id, or a Podcast Index number (older shared links).
  if (!REF.test(id) && !/^\d{1,15}$/.test(id)) return new Response("Not found", { status: 404 });

  const [loaded, f] = await Promise.all([loadEpisode(id), loadFonts()]);
  const ep = loaded.data?.episode;
  if (!ep) return new Response("Not found", { status: 404 });
  const show = loaded.data.show;
  const shared = from ? await getSharedLog(from, { ref: ep.ref, id: ep.id }).catch(() => null) : null;
  const cover = await coverDataUrl(ep.image || ep.feedImage || artOf(show));
  const who = shared?.profile ? shared.profile.display_name || `@${shared.profile.handle}` : null;
  const log = shared?.log;
  const title = clip(ep.title || "", 80);
  const titleSize = title.length > 50 ? 40 : title.length > 32 ? 46 : 52;

  return asJpeg(
    new ImageResponse(
    (
      <div style={{ width: 1200, height: 630, display: "flex", background: C.cream, fontFamily: "Geist", color: C.ink, padding: "56px 64px", position: "relative" }}>
        {/* left: cover */}
        <div style={{ display: "flex", flexDirection: "column", width: 420, marginRight: 56 }}>
          <div
            style={{
              display: "flex",
              width: 400,
              height: 400,
              borderRadius: 40,
              border: `6px solid ${C.ink}`,
              boxShadow: `14px 14px 0 ${C.ink}`,
              transform: "rotate(-3deg)",
              overflow: "hidden",
              background: C.butter,
              alignItems: "center",
              justifyContent: "center",
              marginTop: 18,
            }}
          >
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cover} width={400} height={400} style={{ objectFit: "cover" }} alt="" />
            ) : (
              <div style={{ display: "flex", fontFamily: "Bagel", fontSize: 180, color: C.ink }}>{(ep.feedTitle || "h")[0].toLowerCase()}</div>
            )}
          </div>
        </div>

        {/* right: words */}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
            <div style={{ display: "flex", fontFamily: "Bagel", fontSize: 54, color: C.cobalt, lineHeight: 1 }}>hooked</div>
            <div style={{ display: "flex", position: "relative", width: 300, height: 16, border: `3px solid ${C.ink}`, borderRadius: 999, background: "#fff", marginTop: 10 }}>
              <div style={{ display: "flex", width: 102, height: 10, background: C.pink, borderRadius: 999 }} />
              <div style={{ display: "flex", position: "absolute", left: 88, top: -10, width: 30, height: 30, borderRadius: 999, border: `3px solid ${C.ink}`, background: C.butter }} />
            </div>
          </div>

          <div style={{ display: "flex", fontSize: 30, fontWeight: 700, marginTop: 40, color: C.cobalt }}>
            {who ? clip(`${who} thinks you'd enjoy this`, 44) : "A podcast for you"}
          </div>
          {/* long titles get smaller type so they stay within two or three lines */}
          <div style={{ display: "flex", fontFamily: "Bagel", fontSize: titleSize, lineHeight: 1.12, marginTop: 14 }}>{title}</div>
          <div style={{ display: "flex", fontSize: 28, fontWeight: 500, color: C.muted, marginTop: 14 }}>{clip(ep.feedTitle || show?.title || "", 46)}</div>

          {log && (log.rating > 0 || log.hook) && (
            <div style={{ display: "flex", flexDirection: "column", marginTop: 26, background: "#fff", border: `4px solid ${C.ink}`, borderRadius: 24, padding: "16px 22px", boxShadow: `6px 6px 0 ${C.ink}` }}>
              {log.rating > 0 && <StarRow value={Number(log.rating)} />}
              {log.hook && <div style={{ display: "flex", fontSize: 26, fontWeight: 500, marginTop: log.rating > 0 ? 6 : 0, lineHeight: 1.3 }}>{`“${clip(log.hook, 110)}”`}</div>}
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            position: "absolute",
            left: 92,
            bottom: 44,
            fontSize: 24,
            fontWeight: 700,
            background: C.butter,
            border: `4px solid ${C.ink}`,
            borderRadius: 999,
            padding: "8px 22px",
            transform: "rotate(-4deg)",
            boxShadow: `5px 5px 0 ${C.ink}`,
            alignItems: "center",
          }}
        >
          {/* a drawn triangle: the ▶ character isn't in our fonts, and fetching a font for it slowed the image down */}
          <svg width="18" height="20" viewBox="0 0 18 20" style={{ marginRight: 10 }}>
            <path d="M2 1.5 L16.5 10 L2 18.5 Z" fill={C.ink} />
          </svg>
          Listen free
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts: f }
    )
  );
}
