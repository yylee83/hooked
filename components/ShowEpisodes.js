"use client";
// Show pages' episode list controls (Erin, 2026-11-27): the Newest | Oldest switch's links, and "Hide logged".
import Link from "next/link";
import { noteReplace } from "./BackButton";

/** A sort link that swaps the page in place, so Back doesn't step through every toggle. */
export function SortLink({ href, on, children }) {
  return (
    <Link href={href} replace scroll={false} onClick={noteReplace} className={on ? "is-on" : ""} aria-current={on ? "true" : undefined}>
      {children}
    </Link>
  );
}
