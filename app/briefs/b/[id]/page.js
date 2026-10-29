import { notFound } from "next/navigation";
import BriefView from "@/components/BriefView";
import { getUserBrief } from "@/lib/supabase/public";

export async function generateMetadata({ params }) {
  const { id } = await params;
  const b = await getUserBrief(id);
  return { title: b?.title || "Brief" };
}

// A brief someone made with the + button.
export default async function UserBriefPage({ params }) {
  const { id } = await params;
  const b = await getUserBrief(id);
  if (!b) notFound();
  return (
    <BriefView
      brief={{ title: b.title, dek: b.dek, color: b.color, mode: b.mode, topic: b.topic, author: b.author?.handle, authorId: b.author_id, id: b.id }}
      items={b.items || []}
    />
  );
}
