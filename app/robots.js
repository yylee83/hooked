// robots.txt: what search engines and AI tools may read. Public pages yes; personal pages, sign-in and search
// results no. Previews on Vercel are kept out of search by Vercel itself.
import { siteUrl } from "@/lib/site-url";

export default function robots() {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/api/og/"],
        disallow: [
          "/api/",
          "/me",
          "/notifications",
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
        ],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
