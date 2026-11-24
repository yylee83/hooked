-- Emails about notifications (YY, 2026-11-24): someone followed you, replied, sent you an episode, or gave your
-- review a thumbs up or +. At most one email an hour per person; the rest are bundled into the next one.

-- The on/off switch (My log → gear). On for everyone to start; the email's footer turns it off in one tap.
alter table public.profiles add column if not exists email_notify boolean not null default true;

-- When a notification went out by email, so it's never emailed twice.
alter table public.notifications add column if not exists emailed_at timestamptz;
-- Everything from before today counts as already handled, so turning this on doesn't email old news.
update public.notifications set emailed_at = created_at where emailed_at is null;
create index if not exists notifications_to_email on public.notifications (created_at)
  where emailed_at is null and read_at is null;

-- When each person was last emailed (for the one-an-hour limit). Only the server reads or writes it.
create table if not exists public.notify_emails (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  last_sent_at timestamptz not null default '1970-01-01'
);
alter table public.notify_emails enable row level security;
revoke all on public.notify_emails from public, anon, authenticated;
