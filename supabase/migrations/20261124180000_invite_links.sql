-- Invite links (YY, 2026-11-24: "generate an invite link to anyone ourselves", and "any user can also generate a
-- link to invite their friends").
--
-- Each person has one invite link, hookedonpods.com/i/<code>. Opening it shows "@handle invited you" and the
-- Create account form; signing up through it works without being on allowed_emails. The link's code travels with the
-- sign-up (the account's sign-up details, user_metadata.invite) and hook_invite_gate checks it inside Supabase Auth,
-- so it can't be skipped from the browser.
--
-- No limit (YY, 2026-11-24): a link works for as many friends as you like. Anyone can make a new link if one gets
-- passed around too much: the old one stops working. People who join through a link follow whoever sent it as soon as
-- their profile is made (follow_inviter), so the sender hears about it through the usual follow notification.
-- The old way still works too: an email in allowed_emails can always sign up.

-- One row per link. A link stops working once revoked (replaced by a new one).
create table public.invites (
  code text primary key check (code ~ '^[a-z0-9]{6,16}$'),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index invites_owner on public.invites (owner_id);
-- At most one working link per person.
create unique index invites_one_open on public.invites (owner_id) where revoked_at is null;
alter table public.invites enable row level security;
revoke all on public.invites from anon, authenticated;

-- Each account made through a link. user_id is the new account (no foreign key: the hook runs before the account
-- exists). Kept for the team in Supabase → Table Editor → invite_uses.
create table public.invite_uses (
  user_id uuid primary key,
  email text not null,
  code text not null references public.invites (code) on delete cascade,
  inviter_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index invite_uses_inviter on public.invite_uses (inviter_id);
alter table public.invite_uses enable row level security;
revoke all on public.invite_uses from anon, authenticated;

-- Your invite link, made the first time you ask. new_link: replace it (the old one stops working).
-- Returns the code and how many friends joined through your links.
create function public.my_invite(new_link boolean default false)
returns table (code text, joined int)
language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  c text;
begin
  if me is null or not exists (select 1 from public.profiles p where p.id = me) then
    raise exception 'sign in first';
  end if;
  if new_link then
    update public.invites i set revoked_at = now() where i.owner_id = me and i.revoked_at is null;
  end if;
  select i.code into c from public.invites i where i.owner_id = me and i.revoked_at is null;
  if c is null then
    -- 10 letters and digits from a random UUID (gen_random_uuid uses a secure random source).
    c := substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
    insert into public.invites (code, owner_id) values (c, me);
  end if;
  return query
    select c,
           (select count(*)::int from public.invite_uses u where u.inviter_id = me);
end $$;

-- What an invite page shows: who sent it and whether it still works. Says nothing about who joined.
create function public.invite_info(p_code text)
returns table (inviter_id uuid, handle text, display_name text, open boolean)
language sql stable security definer set search_path = '' as $$
  select p.id, p.handle, p.display_name, i.revoked_at is null
  from public.invites i
  join public.profiles p on p.id = i.owner_id
  where i.code = lower(trim(coalesce(p_code, '')))
$$;

-- Someone who joined through a link follows whoever sent it, as soon as their profile is made (YY, 2026-11-24: "they
-- should auto-follow them, like they do now with Erin and myself"). Unfollowing later sticks: this runs once.
create function public.follow_inviter()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.follows (follower_id, followee_id)
  select new.id, u.inviter_id
  from public.invite_uses u
  where u.user_id = new.id and u.inviter_id <> new.id
    and exists (select 1 from public.profiles p where p.id = u.inviter_id)
  on conflict do nothing;
  return new;
end $$;
revoke execute on function public.follow_inviter() from public, anon, authenticated;
create trigger profiles_follow_inviter after insert on public.profiles
  for each row execute function public.follow_inviter();

-- Called by Supabase Auth just before it creates a user. Returns {} to allow, or an error to refuse.
-- Now also lets in anyone signing up through a working invite link, and counts it.
create or replace function public.hook_invite_gate(event jsonb)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  new_email text := lower(event -> 'user' ->> 'email');
  new_id uuid := nullif(event -> 'user' ->> 'id', '')::uuid;
  inv_code text := lower(trim(coalesce(event -> 'user' -> 'user_metadata' ->> 'invite', '')));
  owner uuid;
begin
  if exists (select 1 from public.allowed_emails a where a.email = new_email) then
    return '{}'::jsonb;
  end if;

  if inv_code <> '' then
    select i.owner_id into owner from public.invites i where i.code = inv_code and i.revoked_at is null;
    if owner is not null then
      if new_id is not null then
        insert into public.invite_uses (user_id, email, code, inviter_id)
        values (new_id, new_email, inv_code, owner)
        on conflict do nothing;
      end if;
      -- On the list from now on, so signing in with an email link later works the same.
      insert into public.allowed_emails (email, note)
      values (new_email, 'invite link ' || inv_code)
      on conflict do nothing;
      return '{}'::jsonb;
    end if;
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403,
      'message', 'This invite link doesn''t work anymore. Ask your friend for a new one, or join the waitlist.'
    ));
  end if;

  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'Hooked is invite-only for now, and this email isn''t on the list yet.'
  ));
end;
$$;

grant execute on function public.hook_invite_gate(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_invite_gate(jsonb) from public, anon, authenticated;
-- The hook reads and writes the invite tables as their owner (security definer), so Auth needs nothing more.

revoke execute on function public.my_invite(boolean) from public, anon;
grant execute on function public.my_invite(boolean) to authenticated;
revoke execute on function public.invite_info(text) from public;
grant execute on function public.invite_info(text) to anon, authenticated;
