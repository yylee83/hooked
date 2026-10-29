import { notFound } from "next/navigation";
import LogSheet from "@/components/LogSheet";
import KeysNotice from "@/components/KeysNotice";
import { episodeCard, getEpisode, safe } from "@/lib/podcastindex";

export const metadata = { title: "Log it" };

export default async function LogPage({ params, searchParams }) {
  const { id } = await params;
  const { hooked } = await searchParams;
  if (!/^\d+$/.test(id)) notFound();

  const ep = await safe(getEpisode(id));
  if (ep.error) return <KeysNotice error={ep.error} />;
  if (!ep.data) notFound();

  const preset = hooked === "1" ? true : hooked === "0" ? false : undefined;
  return <LogSheet episode={episodeCard(ep.data)} preset={preset} />;
}
