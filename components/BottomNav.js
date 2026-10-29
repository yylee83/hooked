"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", label: "Friends" },
  { href: "/briefs", label: "Briefs" },
  { href: "/search", label: "+", plus: true },
  { href: "/search", label: "Search" },
  { href: "/me", label: "My log" },
];

export default function BottomNav() {
  const path = usePathname() || "/";
  if (path.startsWith("/log/")) return null; // the Log it sheet is full-screen
  const active = (href) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <nav className="nav" aria-label="Main">
      <div className="nav__inner">
        {tabs.map((t) =>
          t.plus ? (
            <Link key="plus" href={t.href} className="nav__plus" aria-label="Log an episode">
              <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
                <path d="M12 4v16M4 12h16" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" />
              </svg>
            </Link>
          ) : (
            <Link key={t.label} href={t.href} className={`nav__link ${active(t.href) ? "is-active" : ""}`}>
              {t.label}
            </Link>
          )
        )}
      </div>
    </nav>
  );
}
