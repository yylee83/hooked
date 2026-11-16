import BriefBuilder, { editingFrom } from "@/components/BriefBuilder";
import DraftEditor from "@/components/DraftEditor";
import { getUserBrief } from "@/lib/supabase/public";

export const metadata = { title: "Edit brief" };

export default async function EditBriefPage({ params }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return <DraftEditor id="" />;
  const b = await getUserBrief(id);
  // Not public: a draft (only its author can read it, in the browser), or gone.
  if (!b) return <DraftEditor id={id} />;
  return <BriefBuilder editing={editingFrom(b)} />;
}
