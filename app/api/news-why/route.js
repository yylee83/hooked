// Why Search's "In the news, explained" shows what it shows (team check, 2026-11-25): the news shows found, the possible
// stories, and why a story has no Go deeper. Public podcast information only; from the same saved copy as Search.
import { NextResponse } from "next/server";
import { newsExplained } from "@/lib/news-explained";

export const dynamic = "force-dynamic";

export async function GET() {
  const n = await newsExplained();
  return NextResponse.json({
    builtAt: n.builtAt ? new Date(n.builtAt * 1000).toISOString() : null,
    shown: n.topics.map((t) => `${t.topic}${t.deeper.length ? "" : " (catch up only)"}`),
    ...n.why,
  });
}
