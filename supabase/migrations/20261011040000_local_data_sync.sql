begin;
create table if not exists public."VenueReviewCatalog" (
  id text primary key,
  payload jsonb not null,
  "updatedAt" timestamptz not null default now()
);
alter table public."VenueReviewCatalog" enable row level security;
revoke all on public."VenueReviewCatalog" from anon, authenticated;
grant select on public."VenueReviewCatalog" to authenticated;
grant all on public."VenueReviewCatalog" to service_role;
drop policy if exists "Admins read candidate catalog" on public."VenueReviewCatalog";
create policy "Admins read candidate catalog" on public."VenueReviewCatalog"
  for select to authenticated using (public.venue_review_is_admin());

-- Historical exports may contain personal information. Not exposed through
-- PostgREST or to normal app users; restore via an authorized DB connection.
create schema if not exists sportspace_archive;
revoke all on schema sportspace_archive from public, anon, authenticated;
create table if not exists sportspace_archive.manifests (
  id uuid primary key,
  data jsonb not null,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists sportspace_archive.parts (
  archive_id uuid not null references sportspace_archive.manifests(id),
  part_index integer not null,
  payload bytea not null,
  sha256 text not null,
  primary key (archive_id,part_index)
);
revoke all on all tables in schema sportspace_archive from public, anon, authenticated;
notify pgrst, 'reload schema';
commit;
