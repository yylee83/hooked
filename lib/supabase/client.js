"use client";
// The browser's connection to your Supabase database (accounts + saved data).
import { createBrowserClient } from "@supabase/ssr";

let client;

export function accountsEnabled() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function supabase() {
  if (!accountsEnabled()) return null;
  if (!client) {
    client = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  }
  return client;
}
