-- Briefs can be drafts: saved to your account while you make them (the New brief page saves as you go, and
-- "+ Brief" on an episode page can start one), seen only by you until you publish.
alter table public.briefs add column draft boolean not null default false;

-- Published briefs are public, as before; a draft only to the person making it.
drop policy "briefs read" on public.briefs;
create policy "briefs read" on public.briefs for select using (not draft or (select auth.uid()) = author_id);

-- A draft doesn't count as a brief covering a topic yet.
create or replace view public.insights_brief_ideas with (security_invoker = true) as
select lower(s.query) as query, count(distinct s.user_id)::int as people, count(*)::int as searches,
       round(100.0 * avg((s.tapped_at is null)::int))::int as no_tap_pct
from public.search_events s
where s.created_at > now() - interval '30 days' and s.filter not in ('people')
  and not exists (
    select 1 from public.briefs b
    where not b.draft and (b.title ilike '%' || lower(s.query) || '%' or b.topic ilike '%' || lower(s.query) || '%')
  )
group by lower(s.query)
having count(distinct s.user_id) >= 2
order by people desc, searches desc;

revoke all on public.insights_brief_ideas from anon, authenticated;
