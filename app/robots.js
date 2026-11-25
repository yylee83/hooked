// robots.txt: what search engines and AI tools may read.
// - Search and answer tools (Google, Bing, ChatGPT search, Perplexity, Claude search) may read public pages, so
//   Hooked shows up and gets linked when people ask for podcast recommendations.
// - AI *training* crawlers are asked to stay out entirely (YY, 2026-11-24): reviews and ratings are Hooked's own,
//   not free training data. Well-behaved crawlers follow this; it's a request, not a lock.
// - Personal pages, sign-in and search results are out for everyone.
// Previews on Vercel are kept out of search by Vercel itself.
import { siteUrl } from "@/lib/site-url";

const PRIVATE = [
  "/api/",
  "/me",
  "/notifications",
  "/stats",
  "/log/",
  "/login",
  "/reset-password",
  "/auth/",
  "/welcome",
  "/i/",
  "/lists/new",
  "/lists/b/*/edit",
  "/search/find",
  "/lists/find",
];

// Crawlers that collect pages to train AI models (not the ones that answer a person's question with links).
const TRAINING = [
  "GPTBot",
  "ClaudeBot",
  "anthropic-ai",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
  "Bytespider",
  "meta-externalagent",
  "FacebookBot",
  "Amazonbot",
  "cohere-ai",
  "cohere-training-data-crawler",
  "AI2Bot",
  "Diffbot",
  "Omgilibot",
  "img2dataset",
  "PanguBot",
  "Timpibot",
];

export default function robots() {
  return {
    rules: [
      { userAgent: TRAINING, disallow: "/" },
      { userAgent: "*", allow: ["/", "/api/og/"], disallow: PRIVATE },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
