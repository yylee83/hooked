// The brief builder asks this for episodes about a topic (and the clips that mention it).
import { NextResponse } from "next/server";
import { MissingKeysError } from "@/lib/podcastindex";
import { draftCandidates } from "@/lib/briefs-server";

export const maxDuration = 30;

export async function GET(request) {
  const url = new URL(request.url);
  const topic = (url.searchParams.get("topic") || "").trim().slice(0, 80);
  const mode = url.searchParams.get("mode") === "full" ? "full" : "clips";
  if (topic.length < 2) return NextResponse.json({ error: "Type a topic first." }, { status: 400 });
  try {
    const items = await draftCandidates(topic, mode);
    return NextResponse.json({ topic, mode, items });
  } catch (e) {
    console.error("brief draft failed:", e);
    const keys = e instanceof MissingKeysError;
    return NextResponse.json({ error: keys ? "Podcast Index keys are missing." : "Podcast Index isn't answering. Try again." }, { status: 502 });
  }
}
