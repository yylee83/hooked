"use client";
// @mentions in replies (YY, 2026-11-26). MentionText shows "@ana" as a link to their profile; MentionInput is the
// reply box: typing @ suggests people (in this conversation first, then people you follow, then anyone by handle).
// The database decides who is notified (notify_comment in 20261126180000_reply_mentions.sql), with the same rule
// for what counts as a mention: @ at the start or after a space or punctuation, so ana@site.com isn't one.
import { forwardRef, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { isBlocked, useStore } from "@/lib/store";

const MENTION = /(^|[^a-z0-9._@])@([a-z0-9._]{2,24})/gi;

export function MentionText({ text }) {
  if (!text) return null;
  const out = [];
  let last = 0;
  for (const m of text.matchAll(MENTION)) {
    const handle = m[2].replace(/\.+$/, ""); // "thanks @ana." ends the sentence
    if (handle.length < 2) continue;
    const at = m.index + m[1].length;
    if (at > last) out.push(text.slice(last, at));
    out.push(
      <Link key={at} href={`/u/${handle.toLowerCase()}`} className="mention">
        @{handle}
      </Link>,
    );
    last = at + 1 + handle.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// The @word being typed right before the cursor, if any: { start, query }.
function typing(value, caret) {
  const before = value.slice(0, caret);
  const m = before.match(/(^|[^a-z0-9._@])@([a-z0-9._]{0,24})$/i);
  return m ? { start: caret - m[2].length - 1, query: m[2].toLowerCase() } : null;
}

const matches = (p, q) => p?.handle && (!q || p.handle.toLowerCase().startsWith(q) || (p.display_name || "").toLowerCase().split(/\s+/).some((w) => w.startsWith(q)));

// people: who's in this conversation (the review's author and the people who replied), offered first.
export const MentionInput = forwardRef(function MentionInput({ value, onChange, people = [], ...rest }, outerRef) {
  const state = useStore();
  const own = useRef(null);
  const ref = outerRef || own;
  const [at, setAt] = useState(null); // { start, query }
  const [found, setFound] = useState([]); // from the database, for handles nobody nearby has
  const [pick, setPick] = useState(0);
  const me = state?.user?.id;

  const usable = (p) => p?.handle && p.id !== me && !isBlocked(state, p.id);
  const seen = new Set();
  const nearby = [...people, ...(state?.following || [])].filter((p) => {
    if (!usable(p) || seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
  const q = at?.query ?? null;
  const local = q === null ? [] : nearby.filter((p) => matches(p, q));
  const list = q === null ? [] : [...local, ...found.filter((p) => usable(p) && !seen.has(p.id))].slice(0, 5);

  // Look further afield once a letter is typed and there's room for more.
  useEffect(() => {
    if (!q || local.length >= 5) return setFound([]);
    let live = true;
    const t = setTimeout(async () => {
      const db = supabase();
      if (!db) return;
      const { data } = await db.from("profiles").select("id, handle, display_name").ilike("handle", `${q.replace(/[\\%_]/g, "\\$&")}%`).order("handle").limit(6);
      if (live) setFound(data || []);
    }, 150);
    return () => {
      live = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, local.length]);

  useEffect(() => setPick(0), [q]);

  function update(e) {
    onChange(e);
    setAt(typing(e.target.value, e.target.selectionStart ?? e.target.value.length));
  }

  function choose(p) {
    const el = ref.current;
    const caret = el?.selectionStart ?? value.length;
    const start = at?.start ?? caret;
    const next = `${value.slice(0, start)}@${p.handle} ${value.slice(caret).replace(/^\s+/, "")}`;
    onChange({ target: { value: next } });
    setAt(null);
    requestAnimationFrame(() => {
      const pos = start + p.handle.length + 2;
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  }

  function keys(e) {
    if (!list.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setPick((i) => (i + (e.key === "ArrowDown" ? 1 : list.length - 1)) % list.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      choose(list[pick] || list[0]);
    } else if (e.key === "Escape") {
      setAt(null);
    }
  }

  return (
    <span className="mention-box">
      <input
        {...rest}
        ref={ref}
        value={value}
        onChange={update}
        onKeyDown={keys}
        onBlur={() => setTimeout(() => setAt(null), 150)}
        onSelect={(e) => setAt(typing(e.target.value, e.target.selectionStart ?? 0))}
        autoComplete="off"
        role="combobox"
        aria-expanded={list.length > 0}
        aria-controls="mention-list"
        aria-autocomplete="list"
      />
      {list.length > 0 && (
        <ul className="mention-list" id="mention-list" role="listbox">
          {list.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === pick}>
              <button
                type="button"
                className={`mention-list__row ${i === pick ? "is-on" : ""}`}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => choose(p)}
              >
                <b>@{p.handle}</b>
                {p.display_name && <span className="muted"> {p.display_name}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
});
