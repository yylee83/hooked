/** @type {import('next').NextConfig} */
const nextConfig = {
  // Plain /search and /lists are made ahead of time so they open fully loaded; searches live at /search/find and
  // /lists/find. These rewrites only keep old /search?q=… links working when opened from outside: inside the app, a
  // link to /search?q=… reuses the ready-made page and shows no results, so always link to the find pages.
  // Briefs became Lists (YY, 2026-11-22): old /briefs links, shared before the rename, forward to the same page.
  async redirects() {
    return [
      { source: "/briefs", destination: "/lists", permanent: true },
      // The Google Trends page gave way to Search's "In the news, explained" (2026-11-25).
      { source: "/trending", destination: "/search", permanent: false },
      // The true crime list got an address that matches what people search for (2026-11-26).
      { source: "/lists/true-crime", destination: "/lists/best-true-crime-episodes", permanent: true },
      { source: "/briefs/true-crime", destination: "/lists/best-true-crime-episodes", permanent: true },
      { source: "/briefs/:path*", destination: "/lists/:path*", permanent: true },
    ];
  },
  // Basic protections on every page (security review, 2026-11-26): other sites can't show Hooked inside a frame (so they
  // can't trick people into tapping buttons on it), browsers don't guess file types, and links to other sites don't
  // carry the full Hooked address with them.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/search", has: [{ type: "query", key: "q" }], destination: "/search/find" },
        { source: "/search", has: [{ type: "query", key: "type" }], destination: "/search/find" },
        { source: "/lists", has: [{ type: "query", key: "q" }], destination: "/lists/find" },
      ],
    };
  },
  // Make sure the share-image fonts ship with the server code.
  outputFileTracingIncludes: {
    "/api/og/episode": ["./assets/**"],
  },
  images: {
    // Podcast cover art lives on thousands of hosts, so allow any. Used to make a small
    // 512×512 copy of the cover for the phone's lock screen (iPhone Safari is picky about it).
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "**" },
    ],
    imageSizes: [32, 48, 64, 96, 128, 256, 384, 512],
    maximumRedirects: 5,
    // Only for local testing against a mock server.
    dangerouslyAllowLocalIP: process.env.NODE_ENV === "development",
  },
};

export default nextConfig;
