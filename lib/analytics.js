// Google Analytics events (the tag is in components/Analytics.js, live site only; elsewhere this does nothing).
// Send the event name only: never an email, handle, account id or anything someone typed.
export function trackEvent(name) {
  if (typeof window !== "undefined") window.gtag?.("event", name);
}
