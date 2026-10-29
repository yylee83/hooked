// Full-access database connection for scheduled jobs (the weekly email). Server only.
// Needs SUPABASE_SERVICE_ROLE_KEY, which must never be exposed to the browser.
import "server-only";
import { createClient } from "@supabase/supabase-js";

export function adminDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
