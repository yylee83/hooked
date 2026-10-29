/** @type {import('next').NextConfig} */
const nextConfig = {
  // Make sure the share-image fonts ship with the server code.
  outputFileTracingIncludes: {
    "/api/og/episode": ["./assets/**"],
  },
};

export default nextConfig;
