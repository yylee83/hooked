-- Supabase lets the app's roles (anon, authenticated) run every new function in public by default, so the
-- "revoke ... from public" in 20261112120000_listening_search_history.sql wasn't enough: anyone could run the
-- clean-up, and signed-out visitors could call the record functions (which did nothing without a sign-in).
revoke execute on function public.prune_history() from anon, authenticated;
revoke execute on function public.record_listen(uuid, text, timestamptz, timestamptz, int, int, int, int, int, int, boolean, text) from anon;
revoke execute on function public.record_search(uuid, text, text, int, int, int, int) from anon;
revoke execute on function public.record_search_tap(uuid, text, text, int) from anon;
