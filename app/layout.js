import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "@fontsource/bagel-fat-one/400.css";
import "./globals.css";
import { Suspense } from "react";
import Analytics from "@/components/Analytics";
import AppTime from "@/components/AppTime";
import { BackTracker } from "@/components/BackButton";
import BottomNav from "@/components/BottomNav";
import { DownloadsSetup } from "@/components/Downloads";
import HandleGate from "@/components/HandleGate";
import { NotificationToast } from "@/components/Notifications";
import PickedHandle from "@/components/PickedHandle";
import ViewportReadout from "@/components/ViewportReadout";
import { PlayerProvider } from "@/components/Player";
import { startupImages } from "@/lib/app-splash";
import { site } from "@/lib/site";
import { siteUrl } from "@/lib/site-url";


const description = "Log the podcasts you love, see what your friends are hooked on, and sound smart by dinner.";

export const metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: `${site.name}: ${site.slogan}`, template: `%s · ${site.name}` },
  description,
  applicationName: site.name,
  openGraph: {
    type: "website",
    siteName: site.name,
    title: site.slogan,
    description,
    locale: "en_US",
  },
  twitter: { card: "summary_large_image", title: site.slogan, description },
  // Added to an iPhone's Home Screen: opens full screen as "Hooked", with the cream splash while it loads.
  appleWebApp: { capable: true, title: site.name, statusBarStyle: "default", startupImage: startupImages },
};

export const viewport = {
  themeColor: "#FFF7EE",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <PlayerProvider>
          <main className="app">
            <PickedHandle />
            {children}
          </main>
          <BottomNav />
          <HandleGate />
          <NotificationToast />
          <ViewportReadout />
          <AppTime />
          <Suspense fallback={null}>
            <BackTracker />
          </Suspense>
        </PlayerProvider>
        <DownloadsSetup />
        <Analytics />
      </body>
    </html>
  );
}
