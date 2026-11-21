// Brief cards for the Briefs page: "Featured briefs" (a sideways-swipe row) and the grid of listener briefs.
// Both show a small stack of show covers, the title and one line of details (no description, to stay compact).
import Link from "next/link";
import CoverStack from "./CoverStack";

/** One brief. variant "select" = a card in the Featured briefs row; "cell" = a tile in the grid. */
export function BriefCard({ href, title, color = "cobalt", covers, meta, variant = "cell" }) {
  return (
    <Link href={href} className={`brief-card brief-card--${variant} tone-${color}`}>
      <CoverStack covers={covers} />
      <span className="brief-card__title display">{title}</span>
      {meta && <span className="brief-card__meta mono">{meta}</span>}
    </Link>
  );
}
