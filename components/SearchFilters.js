"use client";
// "Filter:" All / Episodes / Shows (and Friends, when signed in), always under the search box. They belong to the search form
// (form="search-form"), so a pick made while typing goes with the search, and a tap after searching
// re-runs it straight away.

import { useStore } from "@/lib/store";

const OPTIONS = [
  ["all", "All"],
  ["episodes", "Episodes"],
  ["shows", "Shows"],
];
const FRIENDS = ["friends", "Friends"]; // episodes your friends logged (results say "Friends’ episodes")

export default function SearchFilters({ type = "all" }) {
  const signedIn = !!useStore()?.user;
  // Signed out, Friends' episodes only shows if the address asks for it (it then says to sign in).
  const options = signedIn || type === "friends" ? [...OPTIONS, FRIENDS] : [...OPTIONS];
  // People and Briefs live in All; their "See all" views get a pill only while you're on them.
  if (type === "people") options.push(["people", "People"]);
  if (type === "briefs") options.push(["briefs", "Briefs"]);
  const rerun = (e) => {
    const form = document.getElementById("search-form");
    // Only search again if there's something to search for; otherwise the pick waits for the search.
    if (form && form.elements.q?.value.trim()) form.requestSubmit();
    else e.currentTarget.blur();
  };
  return (
    <div className="search-filters" role="radiogroup" aria-labelledby="filters-label">
      <span id="filters-label" className="search-filters__label">Filter:</span>
      {options.map(([value, label]) => (
        <label key={value} className="search-filters__pill">
          <input type="radio" name="type" value={value} form="search-form" defaultChecked={type === value} onChange={rerun} />
          <span className="tab">{label}</span>
        </label>
      ))}
    </div>
  );
}
