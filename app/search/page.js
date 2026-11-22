import Form from "next/form";
import { Suspense } from "react";
import ForYou from "@/components/ForYou";
import SearchFilters from "@/components/SearchFilters";
import { SignInButton } from "@/components/Account";
import { AppleCharts, PopularOnHooked, SectionLoading, Trending } from "@/components/SearchSections";

export const metadata = { title: "Search" };

// Plain /search (nothing typed yet) is made ahead of time and kept for 30 minutes, then remade in the background, so
// it opens fully loaded (YY, 2026-11-21: it was slow while it waited on Google, Apple and Podcast Index each visit).
// A search or a filter goes to its own address, /search/find?q=… (app/search/find/page.js). Inside the app it must link
// there directly: a link to /search?q=… reuses this ready-made page and shows no results (2026-11-22). Old
// /search?q=… links opened from outside still work, through next.config.mjs.
export const revalidate = 1800;

export default function SearchHome() {
  return (
    <>
      <div className="row center page-head">
        <h1 className="display h-lg cobalt">Search</h1>
        <SignInButton />
      </div>
      <p className="muted" style={{ marginTop: 6 }}>
        Find your next listen. Search a show, an episode, or anyone who&apos;s been a guest.
      </p>

      {/* Searching changes the page without reloading the site, so whatever is playing keeps playing (Erin, 2026-11-19). */}
      <Form id="search-form" className="search" action="/search/find" role="search">
        <input className="input" type="search" name="q" placeholder="People, shows, topics" aria-label="Search podcasts" autoFocus />
        <button className="btn btn--cobalt btn--shadow-sm" type="submit">
          Search
        </button>
      </Form>
      <p className="search-paste-hint muted small">Not finding it? Paste a Spotify or Apple Podcasts link to add it.</p>

      <SearchFilters type="all" />

      <Suspense fallback={null}>
        <Trending />
      </Suspense>

      <Suspense fallback={<SectionLoading label="Popular on Hooked" />}>
        <PopularOnHooked />
      </Suspense>

      <ForYou compact />

      <Suspense fallback={null}>
        <AppleCharts />
      </Suspense>
    </>
  );
}
