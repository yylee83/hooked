"use client";
// "Filter results:" All / Episodes / Shows, always under the search box. They belong to the search form
// (form="search-form"), so a pick made while typing goes with the search, and a tap after searching
// re-runs it straight away.

const OPTIONS = [
  ["all", "All"],
  ["episodes", "Episodes"],
  ["shows", "Shows"],
];

export default function SearchFilters({ type = "all" }) {
  const rerun = (e) => {
    const form = document.getElementById("search-form");
    // Only search again if there's something to search for; otherwise the pick waits for the search.
    if (form && form.elements.q?.value.trim()) form.requestSubmit();
    else e.currentTarget.blur();
  };
  return (
    <div className="search-filters" role="radiogroup" aria-labelledby="filters-label">
      <span id="filters-label" className="search-filters__label">Filter results:</span>
      {OPTIONS.map(([value, label]) => (
        <label key={value} className="search-filters__pill">
          <input type="radio" name="type" value={value} form="search-form" defaultChecked={type === value} onChange={rerun} />
          <span className="tab">{label}</span>
        </label>
      ))}
    </div>
  );
}
