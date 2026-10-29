import { notFound } from "next/navigation";
import BriefView from "@/components/BriefView";
import { getBrief } from "@/lib/briefs";
import { resolveCuratedItems } from "@/lib/briefs-server";

export const revalidate = 3600;

export async function generateMetadata({ params }) {
  const { slug } = await params;
  return { title: getBrief(slug)?.title || "Brief" };
}

export default async function CuratedBriefPage({ params }) {
  const { slug } = await params;
  const brief = getBrief(slug);
  if (!brief) notFound();
  const items = await resolveCuratedItems(brief);
  return <BriefView brief={brief} items={items} />;
}
