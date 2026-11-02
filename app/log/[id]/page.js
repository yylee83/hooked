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
  const { hooked } = query;
  if (/^\d{1,15}$/.test(id)) {
    const ref = (await episodeRefFor(id)) || (await loadEpisode(id)).data?.episode?.ref;
    if (ref) redirect(withQuery(`/log/${ref}`, query));
  } else if (!REF.test(id)) notFound();

  const ep = await loadEpisode(id);
  if (ep.error) return <KeysNotice error={ep.error} />;
  if (!ep.data?.episode?.id) notFound();

  const preset = hooked === "1" ? true : hooked === "0" ? false : undefined;
  const { episode, show } = ep.data;
  return <LogSheet episode={{ ...episodeCard(episode, show), ref: episode.ref }} preset={preset} />;
}
