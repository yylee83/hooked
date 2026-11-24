import Link from "next/link";

// Terms of use. A starting draft (YY and Erin, 2026-11-24): have a lawyer review it before a wider launch, including
// which state's law applies, which is left out on purpose until then.
export const metadata = {
  title: "Terms",
  description: "The rules for using Hooked on Pods.",
};

const UPDATED = "November 24, 2026";

export default function TermsPage() {
  return (
    <article className="legal">
      <h1 className="display h-lg">Terms</h1>
      <p className="legal__updated">Last updated {UPDATED}</p>

      <p>
        These are the rules for using Hooked on Pods (&ldquo;Hooked&rdquo;, &ldquo;we&rdquo;). By making an account or using
        the site, you agree to them. Our <Link href="/privacy">Privacy policy</Link> explains what we do with your data.
      </p>

      <h2>Who can use Hooked</h2>
      <ul>
        <li>You must be 13 or older, and old enough to agree to these terms where you live.</li>
        <li>Sign-up is by invite for now. One account per person, and keep your password to yourself.</li>
        <li>You&rsquo;re responsible for what happens on your account. Tell us if you think someone else got into it.</li>
      </ul>

      <h2>Your stuff</h2>
      <p>
        Your reviews, ratings, replies, lists and profile are yours. By posting them on Hooked, you let us store, show and
        share them on Hooked and in links to Hooked (like share previews), so the site can work. This permission ends when
        you delete them, except where someone has already shared them or we need to keep a copy for a short time for
        legal or safety reasons.
      </p>
      <p>Public means public: anyone can read your reviews and profile, and search engines may show them.</p>

      <h2>Be decent</h2>
      <p>Please don&rsquo;t:</p>
      <ul>
        <li>Harass, threaten or bully anyone, or post hate speech.</li>
        <li>Post anything sexual involving minors, or other illegal content.</li>
        <li>Pretend to be someone else, or share other people&rsquo;s private information.</li>
        <li>Spam, or use bots or scripts to post, follow or scrape the site.</li>
        <li>Try to break into accounts, get around our limits, or interfere with how Hooked works.</li>
        <li>Post things you don&rsquo;t have the right to share.</li>
      </ul>
      <p>
        Hooked blocks some words in reviews, replies, lists and names. We may remove anything that breaks these rules, and
        suspend or close accounts that do, usually after a warning unless it&rsquo;s serious. To report something, email{" "}
        <a href="mailto:hello@hookedonpods.com">hello@hookedonpods.com</a>.
      </p>

      <h2>Podcasts belong to their creators</h2>
      <p>
        Hooked doesn&rsquo;t host podcasts. Episodes, show notes and cover art come from each podcast&rsquo;s public feed and
        directories like Podcast Index and Apple Podcasts, and play straight from the podcast&rsquo;s own host. They belong to
        their creators. If you make a podcast and want something changed or taken down, email us.
      </p>

      <h2>Hooked itself</h2>
      <p>
        The Hooked name, logo, design and code belong to us. Please don&rsquo;t copy them or make it look like you&rsquo;re
        Hooked.
      </p>

      <h2>Leaving</h2>
      <p>
        You can stop using Hooked at any time, and ask us to delete your account by emailing{" "}
        <a href="mailto:hello@hookedonpods.com">hello@hookedonpods.com</a>. We may also close accounts that break these terms,
        or wind down Hooked; if we do, we&rsquo;ll try to give you notice.
      </p>

      <h2>The fine print</h2>
      <p>
        Hooked is new and free, and it&rsquo;s provided as it is. We work hard to keep it running and correct, but we
        can&rsquo;t promise it will always be available, error-free, or that podcast information from other sources is
        accurate. As far as the law allows, we aren&rsquo;t responsible for indirect losses, or for what other people post,
        and our total responsibility to you is limited to $50. Some places don&rsquo;t allow these limits, so they may not
        apply to you.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these terms as Hooked grows. We&rsquo;ll change the date at the top, and tell you in Hooked or by email
        if it&rsquo;s a big change. Using Hooked after that means you accept the new terms.
      </p>

      <h2>Contact</h2>
      <p>
        Questions? Email <a href="mailto:hello@hookedonpods.com">hello@hookedonpods.com</a>.
      </p>
    </article>
  );
}
