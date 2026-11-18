import { notFound, redirect } from "next/navigation";
import LogSheet from "@/components/LogSheet";
import KeysNotice from "@/components/KeysNotice";
import { episodeCard } from "@/lib/podcastindex";
import { REF, episodeRefFor, loadEpisode } from "@/lib/catalog";
import { withQuery } from "@/lib/addresses";

export const metadata = { title: "Log it" };

export default async function LogPage({ params, searchParams }) {
  const { id } = await params;
  const query = await searchParams;
  const stars = Number(query.stars);
  if (/^\d{1,15}$/.test(id)) {
    const ref = (await episodeRefFor(id)) || (await loadEpisode(id)).data?.episode?.ref;
    if (ref) redirect(withQuery(`/log/${ref}`, query));
  } else if (!REF.test(id)) notFound();

  const ep = await loadEpisode(id);
  if (ep.error) return <KeysNotice error={ep.error} />;
  if (!ep.data?.episode?.ref && !ep.data?.episode?.id) notFound(); // our id is enough: not every episode is in Podcast Index

  const presetRating = stars > 0 && stars <= 5 ? Math.round(stars * 2) / 2 : 0; // stars picked in the "Log it?" prompt
  const { episode, show } = ep.data;
  return <LogSheet episode={episodeCard(episode, show)} presetRating={presetRating} />;
}
