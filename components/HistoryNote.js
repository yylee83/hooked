import Link from "next/link";

// The notice about listening and search history (lib/history.js), on the welcome screen and in profile settings.
export default function HistoryNote({ style }) {
  return (
    <p className="muted small history-note" style={style}>
      Hooked keeps a private record of what you play and search, to improve Hooked and to show you your own listening in Wrapped. Only you and the Hooked team see it. <Link href="/privacy">Privacy policy</Link>
    </p>
  );
}
