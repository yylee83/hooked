// What Briefs and Search show the moment you tap them, while the server is still putting the page together
// (app/briefs/loading.js, app/search/loading.js). Without it, a tap on the bottom bar left the old page up until the
// new one was ready, which felt like lag (YY, 2026-11-21).
export default function PageLoading({ title, blurb, placeholder }) {
  return (
    <div aria-busy="true" aria-label={`Loading ${title}`}>
      <div className="row center page-head">
        <h1 className="display h-lg cobalt">{title}</h1>
      </div>
      {blurb && <p className="muted" style={{ marginTop: 6 }}>{blurb}</p>}
      <div className="search" aria-hidden="true">
        <div className="input page-loading__box">{placeholder}</div>
        <span className="btn btn--cobalt btn--shadow-sm">Search</span>
      </div>
      <div className="page-loading__rows" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
