"use client";
import { useEffect, useRef, useState } from "react";
import Art from "./Art";
import { haptic } from "@/lib/haptics";

// The brief's running order. Drag a row by its grip (mouse or finger) to move it; the small arrows
// do the same one step at a time (and work with a keyboard). Built on pointer events, so phones
// and computers share one path: the grip has `touch-action: none`, so dragging it never scrolls the page.
const EDGE = 70; // px from the top or bottom of the screen where a drag scrolls the page
const SPEED = 12; // px per frame at the very edge

export default function BriefOrder({ items, keyOf, onMove, onRemove }) {
  const listRef = useRef(null);
  const drag = useRef(null); // { from, to, startY, lastY, rows, shift, scroll, raf }
  const [view, setView] = useState(null); // { from, to, dy, shift } for rendering

  // Where the dragged row would land, from the pointer's place on the page.
  function update() {
    const d = drag.current;
    if (!d) return;
    const y = d.lastY + window.scrollY;
    const first = d.rows[0];
    const last = d.rows[d.rows.length - 1];
    const me = d.rows[d.from];
    // Keep the row inside the list.
    let dy = y - d.startY;
    dy = Math.max(first.top - me.top, Math.min(last.bottom - me.bottom, dy));
    const mid = (me.top + me.bottom) / 2 + dy;
    let to = d.from;
    d.rows.forEach((r, i) => {
      const c = (r.top + r.bottom) / 2;
      if (i < d.from && mid < c) to = Math.min(to, i);
      if (i > d.from && mid > c) to = Math.max(to, i);
    });
    d.to = to;
    setView({ from: d.from, to, dy, shift: d.shift });
  }

  // While dragging near the top or bottom of the screen, scroll so long briefs can be reordered on a phone.
  function tick() {
    const d = drag.current;
    if (!d) return;
    const h = window.innerHeight;
    let v = 0;
    if (d.lastY < EDGE) v = -SPEED * (1 - d.lastY / EDGE);
    else if (d.lastY > h - EDGE) v = SPEED * (1 - (h - d.lastY) / EDGE);
    if (v) {
      window.scrollBy(0, v);
      update();
    }
    d.raf = requestAnimationFrame(tick);
  }

  function start(e, i) {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    haptic();
    const rowsEls = [...listRef.current.children];
    const rows = rowsEls.map((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top + window.scrollY, bottom: r.bottom + window.scrollY };
    });
    const gap = rows.length > 1 ? rows[1].top - rows[0].bottom : 0;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = {
      from: i,
      to: i,
      startY: e.clientY + window.scrollY,
      lastY: e.clientY,
      rows,
      shift: rows[i].bottom - rows[i].top + gap,
    };
    drag.current.raf = requestAnimationFrame(tick);
    update();
  }

  function moveTo(e) {
    if (!drag.current) return;
    drag.current.lastY = e.clientY;
    update();
  }

  function end() {
    const d = drag.current;
    if (!d) return;
    cancelAnimationFrame(d.raf);
    drag.current = null;
    setView(null);
    if (d.to !== d.from) onMove(d.from, d.to);
  }

  useEffect(() => () => drag.current && cancelAnimationFrame(drag.current.raf), []);

  function offset(i) {
    if (!view) return undefined;
    const { from, to, dy, shift } = view;
    if (i === from) return { transform: `translateY(${dy}px)` };
    let y = 0;
    if (from < to && i > from && i <= to) y = -shift;
    if (to < from && i >= to && i < from) y = shift;
    return { transform: `translateY(${y}px)`, transition: "transform .15s ease" };
  }

  return (
    <ol className={`order ${view ? "is-dragging" : ""}`} ref={listRef}>
      {items.map((x, i) => (
        <li key={keyOf(x)} className={`order__row ${view?.from === i ? "is-lifted" : ""}`} style={offset(i)}>
          <button
            type="button"
            className="order__grip"
            aria-label={`Drag to reorder: ${x.episode}`}
            onPointerDown={(e) => start(e, i)}
            onPointerMove={moveTo}
            onPointerUp={end}
            onPointerCancel={end}
            onLostPointerCapture={end}
            onContextMenu={(e) => e.preventDefault()}
            tabIndex={-1}
          >
            <svg viewBox="0 0 10 16" width="10" height="16" aria-hidden="true">
              {[3, 8, 13].map((cy) => (
                <g key={cy}>
                  <circle cx="2.5" cy={cy} r="1.5" />
                  <circle cx="7.5" cy={cy} r="1.5" />
                </g>
              ))}
            </svg>
          </button>
          <span className="mono order__n">{(view ? position(i, view) : i) + 1}</span>
          <Art src={x.image} title={x.show} size={40} radius={9} />
          <span className="min0 grow order__title">{x.episode}</span>
          <span className="order__arrows">
            <button type="button" onClick={() => (haptic(), onMove(i, i - 1))} disabled={i === 0} aria-label="Move up">
              <Chevron up />
            </button>
            <button type="button" onClick={() => (haptic(), onMove(i, i + 1))} disabled={i === items.length - 1} aria-label="Move down">
              <Chevron />
            </button>
          </span>
          <button type="button" className="order__remove" onClick={() => onRemove(x)} aria-label="Remove from list">
            <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
              <path d="M2 2l8 8M10 2l-8 8" />
            </svg>
          </button>
        </li>
      ))}
    </ol>
  );
}

// The number a row will have if dropped now, so the numbers follow the drag.
function position(i, { from, to }) {
  if (i === from) return to;
  if (from < to && i > from && i <= to) return i - 1;
  if (to < from && i >= to && i < from) return i + 1;
  return i;
}

function Chevron({ up }) {
  return (
    <svg viewBox="0 0 12 8" width="12" height="8" aria-hidden="true">
      <path d={up ? "M1.5 6.5L6 2l4.5 4.5" : "M1.5 1.5L6 6l4.5-4.5"} />
    </svg>
  );
}
