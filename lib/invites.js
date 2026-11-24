"use client";
// Invite links (YY, 2026-11-24): everyone has one link, hookedonpods.com/i/<code>, that lets friends make an account
// without being on the invite list. No limit. The database side is migration 20261124180000_invite_links.sql.
import { supabase } from "./supabase/client";

const KEY = "hooked:invite";
export const INVITE_CODE = /^[a-z0-9]{6,16}$/;

// Your link's code and how many friends joined through it. fresh: make a new link (the old one stops working).
export async function myInvite(fresh = false) {
  const db = supabase();
  if (!db) return null;
  const { data, error } = await db.rpc("my_invite", { new_link: fresh });
  if (error) throw new Error("Couldn't get your invite link just now. Try again in a minute.");
  const row = Array.isArray(data) ? data[0] : data;
  return row ? { code: row.code, joined: row.joined || 0 } : null;
}

export function inviteUrl(code) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/i/${code}`;
}

// The link someone opened, kept on this device so it still counts if they look around before signing up.
export function rememberInvite(code) {
  try {
    if (INVITE_CODE.test(code)) localStorage.setItem(KEY, code);
  } catch {}
}

export function savedInvite() {
  try {
    const c = localStorage.getItem(KEY) || "";
    return INVITE_CODE.test(c) ? c : "";
  } catch {
    return "";
  }
}

export function forgetInvite() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}
