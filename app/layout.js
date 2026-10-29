import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "@fontsource/bagel-fat-one/400.css";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import { PlayerProvider } from "@/components/Player";
import { site } from "@/lib/site";

export const metadata = {
  title: { default: `${site.name}: ${site.slogan}`, template: `%s · ${site.name}` },
  description: "Log the podcasts you love, see what your friends are hooked on, and sound smart by dinner.",
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
          <main className="app">{children}</main>
          <BottomNav />
        </PlayerProvider>
      </body>
    </html>
  );
}
