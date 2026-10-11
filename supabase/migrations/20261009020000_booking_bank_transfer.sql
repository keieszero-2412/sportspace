-- Bank transfer snapshots and verified manual payment transitions.
-- No ownership or bank accounts are invented/backfilled by this migration.
alter table public."Bookings"
  add column if not exists payment jsonb,
  add column if not exists "receiptPath" text,
  add column if not exists "receiptBucket" text,
  add column if not exists "updatedAt" bigint,
  add column if not exists "paymentReference" text,
  add column if not exists "verifiedBy" text,
  add column if not exists "refundAmount" numeric default 0,
  add column if not exists "refundedAmount" numeric default 0,
  add column if not exists "refundReference" text,
  add column if not exists "refundedAt" bigint,
  add column if not exists "cancelledAt" bigint;

alter table public."PaymentConfig" add column if not exists "verifiedBy" text;

create table if not exists public."PaymentReferences" (
  "ownerId" text not null,
  reference text not null,
  "bookingId" text not null,
  kind text not null check (kind in ('payment', 'refund')),
  amount numeric not null check (amount > 0),
  primary key ("ownerId", reference)
);
create table if not exists public."Ledger" (
  id text primary key,
  "bookingId" text not null,
  "ownerId" text not null,
  "facilityId" text not null,
  delta numeric not null,
  reference text not null,
  at bigint not null
);
alter table public."PaymentReferences" enable row level security;
alter table public."Ledger" enable row level security;
revoke all on public."PaymentReferences", public."Ledger" from anon, authenticated;
grant all on public."PaymentReferences", public."Ledger" to service_role;
grant select on public."Ledger" to authenticated;
create policy "Read own ledger" on public."Ledger" for select to authenticated
  using ("ownerId" = (select auth.uid())::text);

-- Keep existing public court photos untouched; receipts use a separate bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sportspace-receipts', 'sportspace-receipts', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp']) on conflict (id) do nothing;
create policy "Upload own booking receipt" on storage.objects for insert to authenticated
  with check (bucket_id = 'sportspace-receipts' and (storage.foldername(name))[1] = 'receipts'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and exists (select 1 from public."Bookings" b
      where b.id = (storage.foldername(name))[3] and b."userId" = (select auth.uid())::text
      and b.status = 'held' and b."holdExpiresAt" > extract(epoch from now()) * 1000));
create policy "Read own booking receipt" on storage.objects for select to authenticated
  using (bucket_id = 'sportspace-receipts' and (storage.foldername(name))[1] = 'receipts'
    and exists (select 1 from public."Bookings" b
      where b.id = (storage.foldername(name))[3] and
        (b."userId" = (select auth.uid())::text or b."ownerId" = (select auth.uid())::text)));
notify pgrst, 'reload schema';
