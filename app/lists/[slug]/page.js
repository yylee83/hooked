import { notFound } from "next/navigation";
import BriefView from "@/components/BriefView";
import { getBrief } from "@/lib/briefs";
import { resolveCuratedItems } from "@/lib/briefs-server";
import { briefMetadata } from "@/lib/brief-share";
import JsonLd from "@/components/JsonLd";
import { listData } from "@/lib/structured-data";

export const revalidate = 3600;

export async function generateMetadata({ params }) {
  const { slug } = await params;
  return briefMetadata(slug);
}

export default async function CuratedBriefPage({ params }) {
  const { slug } = await params;
  const brief = getBrief(slug);
  if (!brief) notFound();
  const items = await resolveCuratedItems(brief);
  return (
    <>
      <JsonLd data={listData({ title: brief.title, dek: brief.dek, path: `/lists/${brief.slug}`, items })} />
      <BriefView brief={{ ...brief, sharePath: `/lists/${brief.slug}` }} items={items} />
    </>
  );
}
