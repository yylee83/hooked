/** @type {import('next').NextConfig} */
const nextConfig = {
  // Plain /search and /briefs are made ahead of time so they open fully loaded; a search (?q=…) or a filter
  // (?type=…) is answered by the find pages instead, with the same address in the browser.
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/search", has: [{ type: "query", key: "q" }], destination: "/search/find" },
        { source: "/search", has: [{ type: "query", key: "type" }], destination: "/search/find" },
        { source: "/briefs", has: [{ type: "query", key: "q" }], destination: "/briefs/find" },
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
