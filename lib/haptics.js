// A small buzz on a few key taps (Log it, saving a log, play/pause, stars, hooking a show, reactions, picking up a
// row to drag). Android browsers let a site vibrate the phone. iPhone Safari doesn't, but since iOS 18 it gives its
// own tiny tick when a switch-style checkbox is toggled, so on iPhone we toggle a hidden one. That trick isn't an
// official feature and could stop working with an iOS update; anywhere neither works, nothing happens.
// Call it straight from the tap's handler (not after an await): browsers only allow it during the tap itself.

const VIBRATE_MS = { tap: 8, success: [10, 60, 14] };

let iosSwitch = null;

function iosTick() {
  if (!iosSwitch) {
    const label = document.createElement("label");
    label.setAttribute("aria-hidden", "true");
    label.style.display = "none";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("switch", "");
    input.tabIndex = -1;
    label.appendChild(input);
    iosSwitch = label;
  }
  // In <head>, out of the page's way. Put back if a page change dropped it.
  if (!iosSwitch.isConnected) document.head.appendChild(iosSwitch);
  iosSwitch.click();
}

export function haptic(kind = "tap") {
  try {
    if (typeof window === "undefined") return;
    if (typeof navigator.vibrate === "function") {
      navigator.vibrate(VIBRATE_MS[kind] || VIBRATE_MS.tap);
      return;
    }
    // Only phones and tablets: a desktop with a mouse has nothing to tick.
    if (window.matchMedia?.("(pointer: coarse)").matches) iosTick();
  } catch {
    // Not supported here: stay quiet.
  }
}
