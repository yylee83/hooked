// A search result for a show Apple knows but Podcast Index doesn't. Tapping it brings the show in from
// its own feed (the same as pasting its Apple link) and opens its page.
import { redirect } from "next/navigation";
import { linkTarget, resolveLink } from "@/lib/links";

export async function GET(request, { params }) {
  const { id } = await params;
  if (!/^\d{1,15}$/.test(id)) redirect("/search");
  const apple = `https://podcasts.apple.com/us/podcast/id${id}`;
  const go = await linkTarget(await resolveLink(apple));
  // Couldn't bring it in: Search shows why ("We couldn't find that show yet").
  redirect(go || `/search?q=${encodeURIComponent(apple)}`);
}
