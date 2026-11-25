import TeamStats from "@/components/TeamStats";

// Private stats for the Hooked team (YY, 2026-11-25). The database only answers team members (team_stats()), so
// everyone else sees a short "just for the team" note. Not linked anywhere and kept out of search engines.
export const metadata = { title: "Stats", robots: { index: false, follow: false } };

export default function StatsPage() {
  return <TeamStats />;
}
