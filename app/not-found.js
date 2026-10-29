import Link from "next/link";

export default function NotFound() {
  return (
    <div style={{ paddingTop: 40 }}>
      <h1 className="display h-lg cobalt">Didn't hook.</h1>
      <p className="muted" style={{ margin: "12px 0 22px", fontSize: 19 }}>
        We couldn't find that page, show or episode.
      </p>
      <Link href="/search" className="btn btn--cobalt btn--shadow-sm">
        Search instead
      </Link>
    </div>
  );
}
