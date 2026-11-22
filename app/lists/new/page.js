import BriefBuilder from "@/components/BriefBuilder";

export const metadata = { title: "New list" };

export default async function NewBriefPage({ searchParams }) {
  const { topic } = await searchParams;
  return <BriefBuilder initialTopic={typeof topic === "string" ? topic.slice(0, 80) : ""} />;
}
