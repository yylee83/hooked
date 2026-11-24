// Labels for search engines and AI tools (schema.org structured data): "this is a podcast episode, rated 4.5 by 12
// people", "this is a list of 8 episodes". Invisible on the page. `<` is escaped so text can't end the script early.
export default function JsonLd({ data }) {
  if (!data) return null;
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
