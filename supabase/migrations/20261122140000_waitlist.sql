-- Alpha waitlist and invites (YY, 2026-11-22).
-- Anyone can ask to join (the "Join the waitlist" box on sign-up): join_waitlist saves their email. Nobody can read
-- the list from the app. Erin and YY read it in Supabase → Table Editor → waitlist; to let someone in, add their email
-- to allowed_emails and fill in invited_at here, then email them.

create table public.waitlist (
  email text primary key check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 254),
  created_at timestamptz not null default now(),
  invited_at timestamptz
);
alter table public.waitlist enable row level security;
-- No policies and no grants: the app's roles can't read or change this table directly.
revoke all on public.waitlist from anon, authenticated;

-- Add an email to the waitlist. Says nothing back, so it can't be used to check who is invited.
-- At most 300 new emails an hour, so a script can't flood it.
create function public.join_waitlist(p_email text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  e text := lower(trim(coalesce(p_email, '')));
begin
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(e) > 254 then return; end if;
  if (select count(*) from public.waitlist w where w.created_at > now() - interval '1 hour') >= 300 then return; end if;
  insert into public.waitlist (email) values (e) on conflict do nothing;
end $$;

revoke execute on function public.join_waitlist(text) from public;
grant execute on function public.join_waitlist(text) to anon, authenticated;
