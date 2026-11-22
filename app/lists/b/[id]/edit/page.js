import DraftEditor from "@/components/DraftEditor";

export const metadata = { title: "Edit list" };

// Briefs are edited in the browser, signed in: that's where drafts can be read, and where we can tell
// whether the brief is yours. (The server used to build the editor itself, and crashed on published briefs.)
export default async function EditBriefPage({ params }) {
  const { id } = await params;
  return <DraftEditor id={/^[0-9a-f-]{36}$/i.test(id) ? id : ""} />;
}
