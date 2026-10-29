import { notFound } from "next/navigation";
import BriefBuilder from "@/components/BriefBuilder";
import { getUserBrief } from "@/lib/supabase/public";

export const metadata = { title: "Edit brief" };

export default async function EditBriefPage({ params }) {
  const { id } = await params;
  const b = await getUserBrief(id);
  if (!b) notFound();
  return (
    <BriefBuilder
      editing={{ id: b.id, authorId: b.author_id, title: b.title, dek: b.dek, color: b.color, mode: b.mode, topic: b.topic, items: b.items || [] }}
    />
  );
}
