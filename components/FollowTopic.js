"use client";
// "Follow topic" (YY, 2026-11-25): a small pill to follow a person or subject ("Marc Maron"), on search results and on
// the news cards on Search, and the list of topics you follow (on Notifications), each with × to stop.
// A daily job tells you about each new episode about a topic you follow (app/api/cron/topic-follows).
import Link from "next/link";
import { useStore } from "@/lib/store";
import { useSignInFirst } from "@/lib/sign-in-first";
import { useTopicFollows, topicKeyOf } from "@/lib/topic-follows";
import { haptic } from "@/lib/haptics";

export function FollowTopicButton({ topic, label, showNote = true }) {
  const state = useStore();
  const { guard } = useSignInFirst();
  const follows = useTopicFollows(state?.user?.id);
  if (topicKeyOf(topic).length < 2) return null;
  const on = follows.following(topic);
  return (
    <span className="follow-topic">
      <button type="button" className={`btn btn--sm ${on ? "btn--butter" : ""}`} aria-pressed={on} onClick={guard(() => (haptic(), follows.toggle(topic)))}>
        {on ? "✓ Following" : label || `Follow “${topic}”`}
      </button>
      {on && showNote && <span className="follow-topic__note muted small">We&apos;ll tell you when a new episode is about {topic}.</span>}
    </span>
  );
}

export function FollowedTopics() {
  const state = useStore();
  const follows = useTopicFollows(state?.user?.id);
  if (!state?.user || !follows.list.length) return null;
  return (
    <section className="followed-topics">
      <h2 className="followed-topics__label mono">Topics you follow</h2>
      <div className="followed-topics__row">
        {follows.list.map((r) => (
          <span key={r.topic_key} className="followed-topics__chip">
            <Link href={`/search/find?${new URLSearchParams({ q: r.topic, type: "episodes" })}`}>{r.topic}</Link>
            <button type="button" aria-label={`Stop following ${r.topic}`} onClick={() => (haptic(), follows.toggle(r.topic))}>
              ×
            </button>
          </span>
        ))}
      </div>
    </section>
  );
}
