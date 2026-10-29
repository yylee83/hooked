import Link from "next/link";
import { briefs } from "@/lib/briefs";

export const metadata = { title: "Briefs" };

export default function BriefsPage() {
  return (
    <>
      <h1 className="display h-lg cobalt">Briefs</h1>
      <p className="muted" style={{ margin: "8px 0 24px", fontSize: 19 }}>
        A topic, the best episodes and sections from several shows, and each show's angle.
      </p>
      {briefs.map((b) => (
        <Link key={b.slug} href={`/briefs/${b.slug}`} className={`brief-tile tone-${b.color}`}>
          <span className={`sticker ${b.color === "cobalt" ? "" : "sticker--cobalt"}`}>Brief</span>
          <h2 className="display">{b.title}</h2>
          <p style={{ fontSize: 18 }}>{b.dek.replace(/\*/g, "")}</p>
          <p className="mono small" style={{ marginTop: 14 }}>
            {b.meta}
          </p>
        </Link>
      ))}
    </>
  );
}
