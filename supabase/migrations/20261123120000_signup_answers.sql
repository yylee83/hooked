-- A few answers from new accounts (YY, 2026-11-23: "build a sample set up. keep the signup form short").
-- The sign-up form asks for email, handle, an optional name and "I'm 13 or older". Right after, a short, skippable
-- step asks how they heard about Hooked and, optionally, their city. Favorite shows are saved as hooked shows
-- (hooked_shows), so they feed Suggested follows, New episodes and Home like any other.
--
-- Private: profiles can be read by anyone, so these live in their own table. Each person can read and change only
-- their own row. Erin and YY read them in Supabase → Table Editor → signup_answers.

create table public.signup_answers (
  user_id uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  -- Ticked "I'm 13 or older" on the sign-up form (also kept in the account's sign-up details).
  over_13 boolean,
  -- How they heard about Hooked: one of the choices on the screen, and their own words for "Something else".
  heard_from text check (heard_from in ('friend', 'invite', 'instagram', 'tiktok', 'x', 'podcast', 'article', 'search', 'other')),
  heard_other text check (char_length(heard_other) <= 120),
  -- City or country, as they typed it. Optional.
  place text check (char_length(place) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.signup_answers enable row level security;
create policy "signup answers own" on public.signup_answers for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update on public.signup_answers to authenticated;
revoke all on public.signup_answers from anon;
