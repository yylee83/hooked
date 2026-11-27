"use client";
// TEMPORARY (Erin, 2026-11-26): a small readout of what the iPhone reports about the screen, shown only to @erin, to
// catch why the bottom bar sometimes gets stuck mid-screen in the Home Screen app (see useBottomPinned in
// BottomNav.js). Remove once that's fixed.
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";

const WHO = new Set(["erin"]);
const round = (n) => (typeof n === "number" ? Math.round(n) : "–");

function read() {
  const vv = window.visualViewport;
  const root = document.documentElement;
  const nav = document.querySelector(".nav")?.getBoundingClientRect();
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const a = document.activeElement;
  return {
    mode: standalone ? "app" : "browser",
    screen: round(window.screen?.height),
    inner: round(window.innerHeight),
    client: round(root.clientHeight),
    vvH: round(vv?.height),
    vvTop: round(vv?.offsetTop),
    scale: vv ? Math.round(vv.scale * 100) / 100 : "–",
    shift: root.style.getPropertyValue("--vv-shift") || "0",
    kb: root.classList.contains("keyboard-open") ? "yes" : "no",
    navBottom: round(nav?.bottom),
    focus: a && a !== document.body ? a.tagName.toLowerCase() : "–",
  };
}

export default function ViewportReadout() {
  const state = useStore();
  const on = WHO.has(state?.profile?.handle);
  const [now, setNow] = useState(null);
  const [log, setLog] = useState([]); // last few changes in the page's height, newest first

  useEffect(() => {
    if (!on) return;
    let last = null;
    const tick = (why) => {
      const r = read();
      setNow(r);
      const sig = `${r.inner}/${r.vvH}/${r.vvTop}`;
      if (sig !== last) {
        const t = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
        setLog((l) => [`${t} ${why}: inner ${r.inner} vv ${r.vvH}+${r.vvTop}`, ...l].slice(0, 4));
        last = sig;
      }
    };
    const vv = window.visualViewport;
    const listen = (target, ev) => {
      const f = () => tick(ev);
      target?.addEventListener(ev, f);
      return () => target?.removeEventListener(ev, f);
    };
    const offs = [listen(vv, "resize"), listen(vv, "scroll"), listen(window, "resize"), listen(window, "focusin"), listen(window, "focusout"), listen(window, "pageshow"), listen(document, "visibilitychange")];
    const timer = setInterval(() => tick("tick"), 1000);
    tick("start");
    return () => (offs.forEach((off) => off()), clearInterval(timer));
  }, [on]);

  if (!on || !now) return null;
  return (
    <div className="vp-readout" aria-hidden="true">
      <div>
        {now.mode} · screen {now.screen} · inner {now.inner} · client {now.client}
      </div>
      <div>
        visible {now.vvH} +{now.vvTop} · zoom {now.scale} · shift {now.shift} · kb {now.kb}
      </div>
      <div>
        bar bottom {now.navBottom} · focus {now.focus}
      </div>
      {log.map((l, i) => (
        <div key={i} className="vp-readout__log">
          {l}
        </div>
      ))}
    </div>
  );
}
