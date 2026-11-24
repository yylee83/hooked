import { notFound } from "next/navigation";
import BriefView from "@/components/BriefView";
import { getUserBrief } from "@/lib/supabase/public";
import { briefMetadata } from "@/lib/brief-share";
import JsonLd from "@/components/JsonLd";
import { listData } from "@/lib/structured-data";

export async function generateMetadata({ params }) {
  const { id } = await params;
  return briefMetadata(id);
}

// A brief someone made with the + button.
export default async function UserBriefPage({ params }) {
  const { id } = await params;
  const b = await getUserBrief(id);
  if (!b) notFound();
  return (
    <>
      <JsonLd data={listData({ title: b.title, dek: b.dek, path: `/lists/b/${b.id}`, author: b.author?.handle, items: b.items || [] })} />
      <BriefView
        brief={{ title: b.title, dek: b.dek, color: b.color, mode: b.mode, topic: b.topic, author: b.author?.handle, authorId: b.author_id, id: b.id, sharePath: `/lists/b/${b.id}` }}
        items={b.items || []}
      />
    </>
  );
}
