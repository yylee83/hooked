// The notice about listening and search history (lib/history.js), on the welcome screen and in profile settings.
export default function HistoryNote({ style }) {
  return (
    <p className="muted small history-note" style={style}>
      Hooked keeps a private record of what you play and search, to improve Hooked. Only the Hooked team sees it.
    </p>
  );
}
