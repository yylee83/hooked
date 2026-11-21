import { notFound } from "next/navigation";
import BriefView from "@/components/BriefView";
import { getBrief } from "@/lib/briefs";
import { resolveCuratedItems } from "@/lib/briefs-server";
import { briefMetadata } from "@/lib/brief-share";

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
  return <BriefView brief={{ ...brief, sharePath: `/briefs/${brief.slug}` }} items={items} />;
}
