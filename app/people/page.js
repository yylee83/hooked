import PeopleTabs from "@/components/People";

export const metadata = { title: "People" };

// Your people: who you follow, who follows you, and finding new people.
export default async function PeoplePage({ searchParams }) {
  const { tab } = await searchParams;
  return (
    <>
      <h1 className="display h-lg cobalt">People</h1>
      <p className="muted" style={{ marginTop: 6, fontSize: 19 }}>
        Follow people to see what they're hooked on.
      </p>
      <PeopleTabs initialTab={typeof tab === "string" ? tab : ""} />
    </>
  );
}
