import Link from "next/link";
import { notFound } from "next/navigation";
import PeopleTabs from "@/components/People";
import { getProfile } from "@/lib/supabase/public";

export async function generateMetadata({ params }) {
  const { handle } = await params;
  const profile = await getProfile(handle);
  return { title: profile ? `People · @${profile.handle}` : "People" };
}

// Someone's people: who they follow and who follows them.
export default async function ProfilePeoplePage({ params, searchParams }) {
  const { handle } = await params;
  const { tab } = await searchParams;
  const profile = await getProfile(handle);
  if (!profile) notFound();
  const person = { id: profile.id, handle: profile.handle, display_name: profile.display_name };
  return (
    <>
      <p className="mono small" style={{ marginBottom: 6 }}>
        <Link href={`/u/${profile.handle}`}>← @{profile.handle}</Link>
      </p>
      <h1 className="display h-lg cobalt">{profile.display_name || `@${profile.handle}`}</h1>
      <PeopleTabs person={person} initialTab={typeof tab === "string" ? tab : ""} />
    </>
  );
}
