// llms.txt: a short, plain summary of Hooked for AI tools (ChatGPT, Perplexity, Claude and others), with links to
// the pages worth reading. See llmstxt.org.
import { briefs } from "@/lib/briefs";
import { siteUrl } from "@/lib/site-url";

export const dynamic = "force-static";

export function GET() {
  const base = siteUrl();
  const text = `# Hooked on Pods

> Hooked on Pods (hookedonpods.com) is a social app for podcast episodes, like Letterboxd for podcasts. People log the episodes they listen to, rate them (0.5 to 5 stars), write a one-line review ("What's the hook?"), follow friends, send each other episodes, and make Lists: episode playlists picked by people who listen. Episodes play right in the app.

Anyone can browse and listen. Accounts are invite-only during the beta; there is a waitlist on the sign-up page.

## Featured lists

${briefs.map((b) => `- [${b.title}](${base}/lists/${b.slug}): ${b.dek.replace(/\*/g, "")}`).join("\n")}

## Pages

- [All lists](${base}/lists): featured lists and lists made by listeners
- [Search](${base}/search): find shows, episodes, people and lists; trending topics and popular episodes
- Episode pages (${base}/episode/<id>): show notes, average rating and listener reviews
- Show pages (${base}/show/<id>): every episode, with ratings from Hooked listeners
`;
  return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
