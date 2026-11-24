"use client";
// "Bring your friends" on Find people: your own invite link (YY, 2026-11-24). Friends who open it can make an account
// without being on the invite list, and start out following you. No limit. Invite friends opens the phone's share
// menu (Messages, Mail…); where there isn't one, a sheet with Copy link, Messages, Email and WhatsApp.
import { useEffect, useState } from "react";
import Link from "next/link";
import { LinkSheet } from "./Share";
import { inviteUrl, myInvite } from "@/lib/invites";
import { useStore } from "@/lib/store";

export default function InviteCard() {
  const state = useStore();
  const me = state?.user?.id;
  const [inv, setInv] = useState(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!me) return;
    let live = true;
    myInvite()
      .then((x) => live && setInv(x))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [me]);

  if (state && !state.user) {
    return (
      <div className="card invite">
        <p className="display h-md" style={{ margin: 0 }}>Bring your friends.</p>
        <p style={{ margin: "6px 0 14px" }}>Sign in to get your invite link.</p>
        <Link href="/login?next=/people" className="btn btn--cobalt btn--shadow-sm">Sign in</Link>
      </div>
    );
  }

  const url = inv ? inviteUrl(inv.code) : "";
  const handle = state?.profile?.handle;
  const text = `Come join me on Hooked on Pods, where we log and talk about podcasts${handle ? ` (I'm @${handle})` : ""}. Here's your invite:`;

  async function share() {
    if (!inv) return;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "Join me on Hooked on Pods", text, url });
        return;
      } catch (e) {
        if (e?.name === "AbortError") return; // they closed the menu
      }
    }
    setOpen(true);
  }

  async function fresh() {
    setBusy(true);
    setError("");
    try {
      setInv(await myInvite(true));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card invite">
      <p className="display h-md" style={{ margin: 0 }}>Bring your friends.</p>
      <p style={{ margin: "6px 0 14px" }}>
        Your invite link lets friends join Hooked on Pods. They&apos;ll follow you from the start.
      </p>
      <button className="btn btn--cobalt btn--shadow-sm" onClick={share} disabled={!inv}>
        Invite friends
      </button>
      {inv && (
        <p className="small invite-card__meta">
          {inv.joined > 0 ? `${inv.joined} ${inv.joined === 1 ? "friend has" : "friends have"} joined · ` : ""}
          <button type="button" className="link-btn small" onClick={fresh} disabled={busy}>
            {busy ? "One sec…" : "Make a new link"}
          </button>
        </p>
      )}
      {error && <p className="nudge small">{error}</p>}
      {open && (
        <LinkSheet
          title="Invite friends"
          url={url}
          text={text}
          subject="Join me on Hooked on Pods"
          note="Anyone with this link can make an account. Make a new link anytime and this one stops working."
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
