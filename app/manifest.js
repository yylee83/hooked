import { site } from "@/lib/site";

// What a phone needs to add Hooked to its Home Screen as an app: its name, icon, colors, and to open full screen
// without the browser's bars. iPhone also reads the appleWebApp part of the metadata in app/layout.js.
export default function manifest() {
  return {
    id: "/",
    name: "Hooked on Pods",
    short_name: site.name,
    description: "Log the podcasts you love and see what your friends are hooked on.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#FFF7EE",
    theme_color: "#FFF7EE",
    categories: ["entertainment", "social", "music"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
