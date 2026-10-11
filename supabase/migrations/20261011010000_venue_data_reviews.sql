begin;
create table if not exists public."VenueDataReviews" (
  id uuid primary key default gen_random_uuid(),
  "facilityId" text not null references public."Facilities"(id),
  "reviewerId" text not null,
  key text not null,
  field text not null check (field in ('image', 'phone', 'price_summary')),
  status text not null check (status in ('approve', 'reject')),
  data jsonb not null,
  "createdAt" timestamptz not null default now(),
  unique ("reviewerId", key)
);
create index if not exists venue_reviews_facility_idx on public."VenueDataReviews" ("facilityId", "createdAt" desc);
alter table public."VenueDataReviews" enable row level security;
revoke all on public."VenueDataReviews" from anon, authenticated;
grant select on public."VenueDataReviews" to authenticated;
grant all on public."VenueDataReviews" to service_role;
drop policy if exists "Admins read venue review history" on public."VenueDataReviews";
create policy "Admins read venue review history" on public."VenueDataReviews"
  for select to authenticated using (exists (
    select 1 from public."Users" u where u.id = auth.uid()::text
      and coalesce(u.role, u.raw_data ->> 'role') = 'admin'
  ));

create or replace function public.review_venue_data(p_actor text, p_review jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  venue public."Facilities"%rowtype;
  previous public."VenueDataReviews"%rowtype;
  patch jsonb;
  current_value jsonb;
  result jsonb;
begin
  if not exists (select 1 from public."Users" where id = p_actor
    and coalesce(role, raw_data ->> 'role') = 'admin') then raise exception 'admin-required'; end if;
  if coalesce(p_review ->> 'field','') not in ('image','phone','price_summary')
    or coalesce(p_review ->> 'operation','') not in ('approve','reject')
    or coalesce(p_review ->> 'key','') = '' then raise exception 'invalid-venue-review'; end if;
  select * into venue from public."Facilities" where id = p_review ->> 'facilityId' for update;
  if not found then raise exception 'facility-not-found'; end if;
  select * into previous from public."VenueDataReviews" where "reviewerId" = p_actor and key = p_review ->> 'key';
  if found then
    if previous.data - 'metadata' - 'before' is distinct from p_review - 'metadata'
      then raise exception 'review-key-conflict'; end if;
    return to_jsonb(venue);
  end if;
  current_value := to_jsonb(venue) -> (p_review ->> 'field');
  if p_review ->> 'operation' = 'approve' then
    if current_value is distinct from p_review -> 'expected' then raise exception 'venue-data-changed'; end if;
    patch := jsonb_build_object(p_review ->> 'field', p_review -> 'value') || coalesce(p_review -> 'metadata', '{}'::jsonb);
    update public."Facilities" set
      image = case when p_review ->> 'field' = 'image' then p_review ->> 'value' else image end,
      phone = case when p_review ->> 'field' = 'phone' then p_review ->> 'value' else phone end,
      phone_status = case when p_review ->> 'field' = 'phone' then 'sourced' else phone_status end,
      phone_sources = case when p_review ->> 'field' = 'phone' then p_review -> 'metadata' -> 'phone_sources' else phone_sources end,
      phone_checked_at = case when p_review ->> 'field' = 'phone'
        then (p_review -> 'metadata' ->> 'phone_checked_at')::timestamptz else phone_checked_at end,
      price_summary = case when p_review ->> 'field' = 'price_summary' then p_review ->> 'value' else price_summary end,
      raw_data = coalesce(raw_data, '{}'::jsonb) || patch
    where id = venue.id returning to_jsonb("Facilities".*) into result;
  else result := to_jsonb(venue);
  end if;
  insert into public."VenueDataReviews" ("facilityId", "reviewerId", key, field, status, data)
    values (venue.id, p_actor, p_review ->> 'key', p_review ->> 'field', p_review ->> 'operation',
      p_review || jsonb_build_object('before', current_value));
  return result;
end;
$$;
revoke all on function public.review_venue_data(text, jsonb) from public, anon, authenticated;
grant execute on function public.review_venue_data(text, jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
