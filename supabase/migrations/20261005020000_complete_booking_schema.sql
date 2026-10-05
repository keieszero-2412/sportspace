-- Complete the booking schema expected by the sportspace Edge Function.
-- Existing imported snake_case fields are preserved for compatibility.

alter table public."Facilities"
  add column if not exists "ownerId" text,
  add column if not exists status text default 'active',
  add column if not exists pricing jsonb default '{}'::jsonb,
  add column if not exists "pricingVersion" text;

alter table public."Courts"
  add column if not exists status text,
  add column if not exists "updatedAt" timestamptz;

update public."Courts"
set status = case when coalesce("is_available", true) then 'active' else 'maintenance' end
where status is null;

alter table public."Availability"
  add column if not exists "facility_id" text,
  add column if not exists "facilityId" text,
  add column if not exists "courtId" text,
  add column if not exists "bookingId" text,
  add column if not exists "startAt" bigint,
  add column if not exists "endAt" bigint,
  add column if not exists "expiresAt" bigint;

create table if not exists public."SlotLocks" (
  id text primary key,
  "bookingId" text not null,
  "courtId" text not null,
  "expiresAt" bigint not null
);

create table if not exists public."PaymentConfig" (
  id text primary key,
  bin text,
  account text,
  name text,
  "verifiedAt" bigint,
  raw_data jsonb
);

create index if not exists availability_court_date_idx
  on public."Availability" ("court_id", date);
create index if not exists availability_camel_court_date_idx
  on public."Availability" ("courtId", date);
create index if not exists slot_locks_expiry_idx
  on public."SlotLocks" ("expiresAt");

-- Public timetable reads contain no private booking/customer data.
grant select on public."Courts", public."Availability" to anon, authenticated;
grant all on public."Availability", public."SlotLocks", public."PaymentConfig" to service_role;

notify pgrst, 'reload schema';
