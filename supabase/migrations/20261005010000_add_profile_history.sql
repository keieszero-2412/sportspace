-- Complete the tables read by the profile. No existing records are modified.
create table if not exists public."Bookings" (
  id text primary key,
  "userId" text not null,
  "ownerId" text,
  "schemaVersion" integer,
  "venueId" text,
  "facilityId" text,
  "courtId" text,
  "courtName" text,
  "venueName" text,
  date text,
  time text,
  duration integer,
  ranges jsonb,
  "startAt" bigint,
  "endAt" bigint,
  "totalAmount" numeric,
  "depositPaid" numeric default 0,
  "paymentStatus" text,
  "refundStatus" text,
  status text,
  "holdExpiresAt" bigint,
  "lockIds" jsonb,
  key text,
  fingerprint text,
  "ticketId" text,
  "customerName" text,
  phone text,
  note text,
  "paymentMethod" text,
  "paymentGateway" text,
  "pricingSnapshot" jsonb,
  "attendanceConfirmedAt" bigint,
  "createdAt" timestamptz not null default now(),
  raw_data jsonb
);

create table if not exists public."CredibilityEvents" (
  id text primary key,
  "userId" text not null,
  delta numeric not null,
  reason text,
  "bookingId" text,
  "matchId" text,
  "createdAt" timestamptz not null default now(),
  raw_data jsonb
);

create index if not exists bookings_user_created_id_idx
  on public."Bookings" ("userId", "createdAt" desc, id desc);
create index if not exists credibility_user_created_id_idx
  on public."CredibilityEvents" ("userId", "createdAt" desc, id desc);

alter table public."Bookings" enable row level security;
alter table public."CredibilityEvents" enable row level security;
revoke all on public."Bookings", public."CredibilityEvents" from anon, authenticated;
grant select on public."Bookings", public."CredibilityEvents" to authenticated;
grant all on public."Bookings", public."CredibilityEvents" to service_role;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'Bookings' and policyname = 'Read own bookings') then
    create policy "Read own bookings" on public."Bookings" for select to authenticated
      using ("userId" = (select auth.uid())::text or "ownerId" = (select auth.uid())::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'CredibilityEvents' and policyname = 'Read own credibility events') then
    create policy "Read own credibility events" on public."CredibilityEvents" for select to authenticated
      using ("userId" = (select auth.uid())::text);
  end if;
end $$;

do $$ declare name text; begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach name in array array['Bookings', 'CredibilityEvents'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = name) then
        execute format('alter publication supabase_realtime add table public.%I', name);
      end if;
    end loop;
  end if;
end $$;
notify pgrst, 'reload schema';
