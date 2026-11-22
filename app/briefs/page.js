import BriefsPage from "./find/page";

export const metadata = { title: "Lists" };

// Plain /briefs is made ahead of time and remade in the background every 10 minutes, so it opens fully loaded, featured
// covers and all (YY, 2026-11-21: it was slow while it looked up the featured briefs' episodes on each visit).
// Searching briefs goes to /briefs/find?q=… (app/briefs/find/page.js); old /briefs?q=… links get there through next.config.mjs.
export const revalidate = 600;

export default function BriefsHome() {
  return <BriefsPage searchParams={Promise.resolve({})} />;
}
