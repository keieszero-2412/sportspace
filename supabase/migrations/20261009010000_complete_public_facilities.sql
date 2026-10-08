begin;

alter table public."Facilities"
  add column if not exists facility_id text,
  add column if not exists name_en text,
  add column if not exists province_en text,
  add column if not exists address_en text,
  add column if not exists phone_sources jsonb,
  add column if not exists phone_checked_at timestamptz,
  add column if not exists rating numeric,
  add column if not exists reviews_count integer,
  add column if not exists google_rating numeric,
  add column if not exists google_reviews_count integer,
  add column if not exists google_place_id text;

update public."Facilities"
set
  facility_id = coalesce(facility_id, raw_data ->> 'facility_id', id),
  name_en = coalesce(name_en, raw_data ->> 'name_en'),
  province_en = coalesce(province_en, raw_data ->> 'province_en'),
  address_en = coalesce(address_en, raw_data ->> 'address_en'),
  phone_sources = coalesce(phone_sources, raw_data -> 'phone_sources'),
  phone_checked_at = coalesce(
    phone_checked_at,
    case when coalesce(raw_data ->> 'phone_checked_at', '') ~ '^\d{4}-\d{2}-\d{2}T'
      then (raw_data ->> 'phone_checked_at')::timestamptz end
  ),
  rating = coalesce(
    rating,
    case when coalesce(raw_data ->> 'rating', '') ~ '^\d+(\.\d+)?$'
      then (raw_data ->> 'rating')::numeric end
  ),
  reviews_count = coalesce(
    reviews_count,
    case when coalesce(raw_data ->> 'reviews_count', '') ~ '^\d+$'
      then (raw_data ->> 'reviews_count')::integer end
  ),
  google_rating = coalesce(
    google_rating,
    case when coalesce(raw_data ->> 'google_rating', '') ~ '^\d+(\.\d+)?$'
      then (raw_data ->> 'google_rating')::numeric end
  ),
  google_reviews_count = coalesce(
    google_reviews_count,
    case when coalesce(raw_data ->> 'google_reviews_count', '') ~ '^\d+$'
      then (raw_data ->> 'google_reviews_count')::integer end
  ),
  google_place_id = coalesce(google_place_id, raw_data ->> 'google_place_id');

create unique index if not exists facilities_facility_id_idx
  on public."Facilities" (facility_id);
create index if not exists facilities_public_filters_idx
  on public."Facilities" (province, sport, id);

alter table public."Facilities" enable row level security;
grant select on public."Facilities" to anon, authenticated;
drop policy if exists "Public facility catalogue" on public."Facilities";
create policy "Public facility catalogue" on public."Facilities"
  for select to anon, authenticated using (coalesce(status, 'active') <> 'archived');

notify pgrst, 'reload schema';
commit;
