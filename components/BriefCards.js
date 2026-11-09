// Brief cards for the Briefs page: "Hooked selects" (a sideways-swipe row) and the grid of listener briefs.
// Both show a small stack of show covers, the title and one line of details (no description, to stay compact).
import Link from "next/link";

// Up to three covers, overlapping and slightly tilted, inside the card.
export function CoverStack({ covers = [] }) {
  const list = covers.filter(Boolean).slice(0, 3);
  if (!list.length) return <span className="cover-stack cover-stack--empty" aria-hidden="true" />;
  return (
    <span className="cover-stack" aria-hidden="true">
      {list.map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={i} src={src} alt="" className={`cover-stack__img cover-stack__img--${i}`} loading="lazy" />
      ))}
    </span>
  );
}

/** One brief. variant "select" = a card in the Hooked selects row; "cell" = a tile in the grid. */
export function BriefCard({ href, title, color = "cobalt", covers, meta, variant = "cell" }) {
  return (
    <Link href={href} className={`brief-card brief-card--${variant} tone-${color}`}>
      <CoverStack covers={covers} />
      <span className="brief-card__title display">{title}</span>
      {meta && <span className="brief-card__meta mono">{meta}</span>}
    </Link>
  );
}
