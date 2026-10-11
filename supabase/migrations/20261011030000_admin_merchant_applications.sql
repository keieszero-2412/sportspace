begin;
-- Matches existing applyMerchant / approveMerchant payloads. No seeded data.
create table if not exists public."MerchantApplications" (
  id text primary key,
  "userId" text not null,
  "venueName" text not null,
  "venueAddress" text not null,
  "venueSport" text,
  "venueScale" numeric,
  "bankName" text,
  "bankAccount" text,
  "bankOwner" text,
  "documentPaths" jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  "submittedAt" timestamptz not null default now(),
  "approvedBy" text,
  "approvedAt" timestamptz,
  "facilityId" text
);
create index if not exists merchant_applications_status_idx on public."MerchantApplications"(status,"submittedAt" desc);
alter table public."MerchantApplications" enable row level security;
revoke all on public."MerchantApplications" from anon, authenticated;
grant select on public."MerchantApplications" to authenticated;
grant all on public."MerchantApplications" to service_role;
drop policy if exists "Owner and admin read merchant applications" on public."MerchantApplications";
create policy "Owner and admin read merchant applications" on public."MerchantApplications"
  for select to authenticated using ("userId"=auth.uid()::text or public.venue_review_is_admin());
notify pgrst, 'reload schema';
commit;
