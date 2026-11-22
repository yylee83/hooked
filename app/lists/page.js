import BriefsPage from "./find/page";

export const metadata = { title: "Lists" };

// Plain /lists is made ahead of time and remade in the background every 10 minutes, so it opens fully loaded, featured
// covers and all (YY, 2026-11-21: it was slow while it looked up the featured briefs' episodes on each visit).
// Searching briefs goes to /lists/find?q=… (app/lists/find/page.js); old /lists?q=… links get there through next.config.mjs.
export const revalidate = 600;

export default function BriefsHome() {
  return <BriefsPage searchParams={Promise.resolve({})} />;
}
