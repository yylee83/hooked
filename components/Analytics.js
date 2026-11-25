import Script from "next/script";

// Google Analytics (GA4), for visit stats (YY, 2026-11-25). Only on the live site, so previews and local runs
// don't count. Google's ad features are switched off, to match the privacy page's "no ads" promise. Page changes
// inside the app are counted by GA's own "page changes based on browser history" setting (on by default).
const GA_ID = "G-76H27FH7CE";

export default function Analytics() {
  if (process.env.VERCEL_ENV !== "production") return null;
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
      <Script id="ga-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_ID}', { allow_google_signals: false, allow_ad_personalization_signals: false });`}
      </Script>
    </>
  );
}
