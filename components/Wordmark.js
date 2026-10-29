import Link from "next/link";

// The "hooked on" wordmark with the playhead bar: an episode you're partway into.
export default function Wordmark({ size = 44, href = "/" }) {
  return (
    <Link href={href} className="wordmark" style={{ "--wm": `${size}px` }} aria-label="Hooked on home">
      <span className="wordmark__text">hooked on</span>
      <span className="playhead" aria-hidden="true">
        <span className="playhead__fill" />
        <span className="playhead__knob" />
      </span>
    </Link>
  );
}
