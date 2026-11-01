-- Invite-only sign-up.
-- Anyone can browse Hooked, but only emails on the invite list can create an account.
-- The check runs inside Supabase Auth (a "Before User Created" hook), so it can't be skipped
-- from the browser. It covers every way of signing up: password, email link, and Google later.
--
-- After this is applied, switch the hook on once in the dashboard:
--   Authentication → Hooks → Before User Created → Postgres → schema public → function hook_invite_gate

-- The invite list. Emails are stored in lower case.
-- No one can read or change it from the app: add invites in Supabase → Table Editor → allowed_emails.
create table public.allowed_emails (
  email text primary key check (email = lower(email)),
  note text,                                     -- optional: who invited them, or why
  created_at timestamptz not null default now()
);
alter table public.allowed_emails enable row level security;
revoke all on public.allowed_emails from anon, authenticated;

-- Everyone who already has an account stays welcome.
-- (Copied from the database, so no email addresses are written into this public repo.)
insert into public.allowed_emails (email, note)
select lower(email), 'had an account before invites'
from auth.users
where email is not null
on conflict do nothing;

-- Called by Supabase Auth just before it creates a user. Returns {} to allow, or an error to refuse.
create function public.hook_invite_gate(event jsonb)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  new_email text := lower(event -> 'user' ->> 'email');
begin
  if exists (select 1 from public.allowed_emails a where a.email = new_email) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'Hooked is invite-only for now, and this email isn''t on the list yet.'
  ));
end;
$$;

-- Only Supabase Auth may call it.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.hook_invite_gate(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_invite_gate(jsonb) from public, anon, authenticated;
