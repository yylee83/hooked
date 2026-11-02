import { linkPieces, notesToParagraphs } from "@/lib/notes";

// Show notes as plain paragraphs, with web addresses as links. Never renders the feed's own HTML.
export default function Notes({ text, className = "ep-notes" }) {
  const paragraphs = notesToParagraphs(text);
  if (!paragraphs.length) return null;
  return (
    <div className={className}>
      {paragraphs.map((p, i) => (
        <p key={i}>
          {linkPieces(p).map((piece, j) =>
            typeof piece === "string" ? (
              piece
            ) : (
              <a key={j} href={piece.href} target="_blank" rel="noopener noreferrer nofollow ugc" className="ep-notes__link">
                {piece.text.slice(0, 80)}
              </a>
            )
          )}
        </p>
      ))}
    </div>
  );
}
