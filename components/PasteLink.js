"use client";
// "Paste an Apple Podcasts or Spotify link" → straight to logging that episode.
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PasteLink({ onDone, autoFocus = false }) {
  const router = useRouter();
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function go(e, value) {
    e?.preventDefault();
    const url = (value ?? link).trim();
    if (!url) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await (await fetch(`/api/resolve?url=${encodeURIComponent(url)}`)).json();
      if (r.go) {
        onDone?.();
        router.push(r.note ? `${r.go}?note=${encodeURIComponent(r.note)}` : r.go);
        return;
      }
      setMsg({ text: r.error || "We couldn't find that one.", query: r.query });
    } catch {
      setMsg({ text: "Something went wrong. Try again." });
    }
    setBusy(false);
  }

  return (
    <form className="paste" onSubmit={go}>
      <label className="mono small paste__label" htmlFor="paste-link">
        Or paste a link from Apple Podcasts or Spotify
      </label>
      <div className="paste__row">
        <input
          id="paste-link"
          className="input"
          type="url"
          inputMode="url"
          placeholder="https://podcasts.apple.com/…"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          onPaste={(e) => {
            // Pasting a link starts the lookup right away.
            const t = e.clipboardData.getData("text").trim();
            if (!t) return;
            e.preventDefault();
            setLink(t);
            go(null, t);
          }}
          autoFocus={autoFocus}
        />
        <button className="btn btn--cobalt" disabled={busy || !link.trim()}>
          {busy ? "Finding…" : "Log it"}
        </button>
      </div>
      {msg && (
        <p className="paste__msg">
          {msg.text}{" "}
          {msg.query && (
            <a href={`/search?q=${encodeURIComponent(msg.query)}&type=episodes`} className="more-link">
              Search for it →
            </a>
          )}
        </p>
      )}
    </form>
  );
}
