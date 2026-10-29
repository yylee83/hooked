import { PeopleFinder } from "@/components/Friends";

export const metadata = { title: "Find friends" };

export default function PeoplePage() {
  return (
    <>
      <h1 className="display h-lg cobalt">Find friends</h1>
      <p className="muted" style={{ marginTop: 6, fontSize: 19 }}>
        Follow people to see what they're hooked on.
      </p>
      <PeopleFinder />
    </>
  );
}
