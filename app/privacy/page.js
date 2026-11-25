import Link from "next/link";

// Privacy policy. Written to match what the app actually stores (see CLAUDE.md: tables, history, emails).
// A starting draft (YY and Erin, 2026-11-24): have a lawyer review it before a wider launch. If anything here changes
// (a new kind of data, ads, a new service), update this page and the date in the same change.
export const metadata = {
  title: "Privacy policy",
  description: "What Hooked on Pods collects, who sees it, and how to get it deleted.",
};

const UPDATED = "November 25, 2026";

export default function PrivacyPage() {
  return (
    <article className="legal">
      <h1 className="display h-lg">Privacy policy</h1>
      <p className="legal__updated">Last updated {UPDATED}</p>

      <p>
        Hooked on Pods (&ldquo;Hooked&rdquo;, &ldquo;we&rdquo;) is a place to log podcast episodes, review them and share
        them with friends. This page says what we collect, who can see it and what you can do about it. The short version:
        your reviews and profile are public, your listening history is private to you and the Hooked team, and we don&rsquo;t
        sell your data or show ads.
      </p>

      <h2>What we collect</h2>
      <p className="legal__lead">When you make an account</p>
      <ul>
        <li>Your email address and password (the password is stored scrambled; we can&rsquo;t read it).</li>
        <li>Your handle, and a name if you add one.</li>
        <li>That you ticked &ldquo;I&rsquo;m 13 or older&rdquo;.</li>
        <li>If you joined from an invite link, whose link it was.</li>
        <li>If you answer the optional sign-up questions: how you heard about Hooked, your city and country, and the shows you picked as favorites.</li>
        <li>If you join the waitlist: just your email address.</li>
      </ul>

      <p className="legal__lead">When you use Hooked</p>
      <ul>
        <li>What you log: episodes, star ratings, reviews (&ldquo;What did you think?&rdquo;), shows you&rsquo;re hooked on and the lists you make.</li>
        <li>What you do with other people: follows, replies, thumbs up and down, + (want to listen), and episodes you send.</li>
        <li>Your Up next queue, where you stopped in each episode, and episodes you finished but haven&rsquo;t logged.</li>
        <li>Topics you follow (a person or subject), so we can tell you about new episodes about them.</li>
        <li>
          A record of what you play in Hooked&rsquo;s player (what, where you started it from, how far you got, skips) and
          what you search for and tap. This is how Wrapped and your listening hours work.
        </li>
        <li>How many minutes you have Hooked open and in use each day (not which pages), so we know how much time people spend here.</li>
        <li>When you tap a &ldquo;Share&rdquo; button (which kind of share, not who you sent it to).</li>
        <li>
          Reports you send (what you reported, the reason and any note; we keep a copy of the reported words) and the
          people you block.
        </li>
      </ul>

      <p className="legal__lead">What we don&rsquo;t collect</p>
      <ul>
        <li>No advertising cookies. Besides the cookies that keep you signed in, Google Analytics sets its own (see below).</li>
        <li>No contacts from your phone, no precise location, no payment details.</li>
      </ul>
      <p>
        If you use Hooked without an account, your log is kept only in your browser on that device, and moves into your
        account if you make one.
      </p>

      <h2>Who can see what</h2>
      <p className="legal__lead">Anyone, including search engines</p>
      <ul>
        <li>Your handle, name and profile page.</li>
        <li>Your logs, ratings and reviews, the shows you&rsquo;re hooked on, and your published lists.</li>
        <li>Your replies and reactions on reviews, and who you follow and who follows you.</li>
        <li>What you&rsquo;re playing right now: people who follow you see it under &ldquo;Friends listening now&rdquo; for a day.</li>
      </ul>
      <p>
        Search engines like Google may show public reviews and profiles in their results. We ask AI-training crawlers not
        to collect Hooked pages.
      </p>

      <p className="legal__lead">Only you (and the people involved)</p>
      <ul>
        <li>Your Up next queue, listening progress, unfinished-episode reminders and the topics you follow.</li>
        <li>Sends: only you and the person you sent to.</li>
        <li>Your notifications, and draft lists.</li>
        <li>Who you&rsquo;ve blocked. The person you block isn&rsquo;t told.</li>
      </ul>

      <p className="legal__lead">Only you and the Hooked team</p>
      <ul>
        <li>
          Your listening and search history. You see your own totals (Wrapped, hours listened). The team looks at it to
          make Hooked better, for example which episodes people finish and which searches find nothing.
        </li>
        <li>Your email address, sign-up answers, share taps and minutes in the app.</li>
        <li>Reports. The person you report isn&rsquo;t told who reported them.</li>
      </ul>
      <p>
        &ldquo;Listening on Hooked now&rdquo; shows which episodes are being played across Hooked, with counts only, never
        names.
      </p>

      <h2>How we use it</h2>
      <ul>
        <li>To run Hooked: your log, your feed, suggestions of people to follow and episodes you might like.</li>
        <li>To show trending episodes and conversations (we use totals, not who did what).</li>
        <li>To send you sign-in emails and notification emails (see below).</li>
        <li>To understand what&rsquo;s working and improve Hooked.</li>
        <li>To keep Hooked safe, for example blocking certain words in reviews and names, reviewing reports and removing posts that break the rules.</li>
      </ul>
      <p>
        We don&rsquo;t sell your data, share it with advertisers or use it for ads. If that ever changes, we&rsquo;ll update
        this page and tell you first, and it won&rsquo;t apply to what you shared before without asking you.
      </p>

      <h2>Emails</h2>
      <p>
        We email you to sign in or reset your password, and, unless you turn them off, when someone follows you, replies,
        sends you an episode, or gives your review a thumbs up or +. We send at most one of those an hour. There may also be a weekly roundup of what friends logged and sent you. Turn any of these off in
        the settings on My log (the gear), or with the unsubscribe link in any of them.
      </p>

      <h2>Services we use</h2>
      <p>These companies handle data for us, only to run Hooked:</p>
      <ul>
        <li><strong>Supabase</strong>: our database and sign-in. Your account and everything you save lives here.</li>
        <li><strong>Vercel</strong>: hosts the website.</li>
        <li><strong>Resend</strong>: sends our emails, so it sees your email address and the email.</li>
        <li>
          <strong>Google Analytics</strong>: counts visits, like which pages are opened, roughly where from (city or
          country) and on what kind of device. It also counts when an account is created or someone joins the waitlist.
          It uses cookies and sees your IP address, but we don&rsquo;t send it your account, email or
          what you write. Google&rsquo;s ad features are turned off. You can opt out with{" "}
          <a href="https://tools.google.com/dlpage/gaoptout">Google&rsquo;s opt-out add-on</a> or by blocking cookies.
        </li>
      </ul>
      <p>
        We also look up podcasts with Podcast Index, Apple Podcasts and Spotify, but we don&rsquo;t send them anything about
        you. Episodes play straight from each podcast&rsquo;s own host, and cover art loads from wherever the podcast keeps
        it, so those hosts see the usual things any website sees, like your IP address. Their own privacy policies apply.
      </p>
      <p>Our services are mostly in the United States, so your data may be stored and handled there.</p>

      <h2>How long we keep it</h2>
      <ul>
        <li>Your account and what you post: until you delete them or ask us to delete your account.</li>
        <li>Listening, search and share history, and minutes in the app: one year, then it&rsquo;s deleted automatically.</li>
        <li>Notifications: until you clear them.</li>
      </ul>

      <h2>Your choices</h2>
      <ul>
        <li>Edit or delete your reviews, replies and lists at any time.</li>
        <li>Change your handle and name in My log → Edit profile.</li>
        <li>Turn notification emails on or off in My log → the gear.</li>
        <li>
          To get a copy of your data, correct it, or delete your account and everything in it, email{" "}
          <a href="mailto:hello@hookedonpods.com">hello@hookedonpods.com</a> from the address on your account. We&rsquo;ll
          do it within 30 days.
        </li>
      </ul>
      <p>
        Depending on where you live (for example California, the UK or the EU), you may have more rights under the law,
        such as to object to how we use your data or to complain to your local data protection authority. Email us and
        we&rsquo;ll help.
      </p>

      <h2>Kids</h2>
      <p>
        Hooked is for people 13 and older. We don&rsquo;t knowingly collect data from anyone younger. If you think a child
        under 13 has an account, email us and we&rsquo;ll delete it.
      </p>

      <h2>Security</h2>
      <p>
        We use encrypted connections, keep each person&rsquo;s private data locked to their own account, and limit who on the
        team can reach the database. No service is perfectly secure, so use a password you don&rsquo;t use elsewhere.
      </p>

      <h2>Changes</h2>
      <p>
        If we change this policy, we&rsquo;ll update the date at the top. If it&rsquo;s a big change, we&rsquo;ll tell you in
        Hooked or by email first.
      </p>

      <h2>Contact</h2>
      <p>
        Questions? Email <a href="mailto:hello@hookedonpods.com">hello@hookedonpods.com</a>. See also our{" "}
        <Link href="/terms">Terms</Link>.
      </p>
    </article>
  );
}
