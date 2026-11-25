// Claude as the editor of "In the news, explained" (lib/news-explained.js): for one story, it reads this week's news
// episode next to the candidate "Go deeper" episodes and keeps only those that give real, still-accurate background,
// with a one-line reason for each. It also names the story clearly ("Louvre heist", not "Louvre") and writes one line
// on what's happening.
// Needs ANTHROPIC_API_KEY (server-only, in Vercel). Without it, or if Claude doesn't answer, the caller falls back to
// its own ranking. Answers are kept a day per story and candidate list, so each story costs one call a day at most.
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { unstable_cache } from "next/cache";

const MODEL = "claude-opus-5-5";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "summary", "picks"],
  properties: {
    name: { type: "string", description: "The story's name for a chip: 1 to 4 words, plain, no punctuation at the end." },
    summary: { type: "string", description: "One sentence, at most 110 characters: what's happening this week." },
    picks: {
      type: "array",
      description: "0 to 2 candidate episodes, best first. Empty if none truly helps.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "why"],
        properties: {
          id: { type: "string", description: "The candidate's id, exactly as given." },
          why: { type: "string", description: "At most 70 characters: what background this gives, e.g. \"How the strait became the world's oil chokepoint\"." },
        },
      },
    },
  },
};

const SYSTEM = `You pick background listening for a podcast app's "In the news, explained" section. Listeners tap a news story, hear this week's news episode to catch up, then want one or two older episodes that help them understand the story more deeply.

For the story you're given, choose at most 2 candidates. Keep a candidate only if:
- it is clearly about this story's subject (not a different event, person or place that shares a word),
- it gives real background: history, how something works, the people or forces involved,
- it is still accurate and useful now, not overtaken by later events in a way that would mislead,
- it comes from a substantial, reputable show (not a fan show, a sermon, a promo, a quiz or a clip compilation).
Prefer candidates marked "linked by the news show" or "trusted shelf" when they fit just as well. Prefer two different shows. It is fine, and often right, to pick none.

Write plainly and briefly, without hype or exclamation marks. The name is what a newspaper would call the story in 1 to 4 words.`;

const clip = (s = "", n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const yearOf = (t) => (t ? new Date(t * 1000).getUTCFullYear() : "");

async function ask(input) {
  const client = new Anthropic();
  const lines = input.candidates.map(
    (c) =>
      `- id ${c.id}: "${c.title}" (${c.show}, ${yearOf(c.date)}${c.minutes ? `, ${c.minutes} min` : ""})${c.flags.length ? ` [${c.flags.join("; ")}]` : ""}\n  ${clip(c.description, 280)}`
  );
  const prompt = `Story (as found in news podcasts): ${input.topic}

This week's news episode: "${input.fresh.title}" (${input.fresh.show})
${clip(input.fresh.description, 900)}

Candidates for "Go deeper":
${lines.join("\n")}`;
  const res = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 2000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: "user", content: prompt }],
  });
  if (res.stop_reason === "refusal") return null;
  const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  const out = JSON.parse(text);
  const ids = new Set(input.candidates.map((c) => c.id));
  return {
    name: clip(String(out.name || "").trim(), 40),
    summary: clip(String(out.summary || "").trim(), 140),
    picks: (out.picks || []).filter((p) => ids.has(String(p.id))).slice(0, 2).map((p) => ({ id: String(p.id), why: clip(String(p.why || "").trim(), 90) })),
  };
}

/**
 * input: { topic, fresh: { id, title, show, description }, candidates: [{ id, title, show, date, minutes, description, flags }] }
 * Returns { name, summary, picks: [{ id, why }] }, or null (no key, refusal, error).
 */
export async function claudeEditor(input) {
  if (!process.env.ANTHROPIC_API_KEY || !input.candidates.length) return null;
  const key = [input.topic.toLowerCase(), String(input.fresh.id), input.candidates.map((c) => c.id).join(",")].join("|");
  try {
    return await unstable_cache(() => ask(input), ["news-claude", "v1", key], { revalidate: 86400 })();
  } catch {
    return null;
  }
}
