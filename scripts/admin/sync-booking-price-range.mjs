import dotenv from 'dotenv';
import postgres from 'postgres';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { bookingRates } from '../lib/booking-price-sync.mjs';
dotenv.config({ quiet: true });
if (process.env.VITE_SUPABASE_URL !== 'https://dzpbnvpqkwsjlvdxwwub.supabase.co') throw new Error('Unexpected project');
const apply = process.argv.includes('--apply');
const sql = postgres(process.env.MY_SUPABASE_DB_URL, { max: 1, connect_timeout: 10,
  connection: { statement_timeout: 60000, lock_timeout: 10000, default_transaction_read_only: apply ? 'off' : 'on' } });
const runId = crypto.randomUUID();
try {
  const result = await sql.begin(async tx => {
    const venues = apply
      ? await tx`select id,raw_data->'price_reference' reference from public."Facilities" order by id for update`
      : await tx`select id,raw_data->'price_reference' reference from public."Facilities" order by id`;
    const plans = venues.flatMap(v => {
      const rates = bookingRates(v.reference);
      return rates ? [{ facility_id: v.id, ...rates }] : [];
    });
    const skipped = venues.filter(v => !bookingRates(v.reference)).map(v => v.id);
    if (!apply) return { mode: 'audit', eligibleVenues: plans.length, skipped };
    assert(plans.length > 0);
    await tx`create table if not exists public."CourtPriceSyncHistory" (
      "runId" uuid not null, "courtId" text not null, "facilityId" text not null,
      "beforeData" jsonb not null, "appliedRates" jsonb not null,
      "createdAt" timestamptz not null default now(), primary key ("runId","courtId")
    )`;
    await tx`alter table public."CourtPriceSyncHistory" enable row level security`;
    await tx`revoke all on public."CourtPriceSyncHistory" from anon,authenticated`;
    await tx`grant all on public."CourtPriceSyncHistory" to service_role`;
    // Lock in a stable order, shared with the real hold flow; no booking writes.
    await tx`select c.id from public."Courts" c
      join jsonb_to_recordset(${tx.json(plans)}) as p(facility_id text) on p.facility_id=c.facility_id
      order by c.id for update of c`;
    await tx`insert into public."CourtPriceSyncHistory" ("runId","courtId","facilityId","beforeData","appliedRates")
      select ${runId}::uuid,c.id,c.facility_id,to_jsonb(c),to_jsonb(p)-'facility_id'
      from public."Courts" c join jsonb_to_recordset(${tx.json(plans)})
        as p(facility_id text,"basePrice" bigint,price_day bigint,price_night bigint,price_weekend bigint)
      on p.facility_id=c.facility_id
      where c."basePrice" is distinct from p."basePrice" or c.price_day is distinct from p.price_day
        or c.price_night is distinct from p.price_night or c.price_weekend is distinct from p.price_weekend`;
    const changed = await tx`update public."Courts" c set
      "basePrice"=(h."appliedRates"->>'basePrice')::bigint,
      price_day=(h."appliedRates"->>'price_day')::bigint,
      price_night=(h."appliedRates"->>'price_night')::bigint,
      price_weekend=(h."appliedRates"->>'price_weekend')::bigint,
      "updatedAt"=current_timestamp,
      raw_data=coalesce(c.raw_data,'{}'::jsonb)||h."appliedRates"||jsonb_build_object('updatedAt',current_timestamp)
      from public."CourtPriceSyncHistory" h where h."runId"=${runId}::uuid and c.id=h."courtId"
      returning c.id`;
    const [invalid] = await tx`select count(*)::int total from public."Courts" c
      join public."CourtPriceSyncHistory" h on c.id=h."courtId" and h."runId"=${runId}::uuid
      where (to_jsonb(c)-array['basePrice','price_day','price_night','price_weekend','updatedAt','raw_data'])
        is distinct from (h."beforeData"-array['basePrice','price_day','price_night','price_weekend','updatedAt','raw_data'])
      or (coalesce(c.raw_data,'{}'::jsonb)-array['basePrice','price_day','price_night','price_weekend','updatedAt'])
        is distinct from (coalesce(h."beforeData"->'raw_data','{}'::jsonb)-array['basePrice','price_day','price_night','price_weekend','updatedAt'])`;
    assert.equal(invalid.total, 0, 'Unrelated court fields changed; rolling back');
    const [mismatch] = await tx`select count(*)::int total from public."Courts" c
      join jsonb_to_recordset(${tx.json(plans)})
        as p(facility_id text,"basePrice" bigint,price_day bigint,price_night bigint,price_weekend bigint)
      on p.facility_id=c.facility_id where c."basePrice" is distinct from p."basePrice"
        or c.price_day is distinct from p.price_day or c.price_night is distinct from p.price_night
        or c.price_weekend is distinct from p.price_weekend`;
    assert.equal(mismatch.total, 0, 'Price mismatch; rolling back');
    return { mode: 'applied', runId, eligibleVenues: plans.length, updatedCourts: changed.length,
      skipped, remainingMismatches: mismatch.total, unrelatedChanges: invalid.total,
      existingBookings: 'untouched', backup: 'CourtPriceSyncHistory' };
  });
  console.log(JSON.stringify(result));
} finally { await sql.end({ timeout: 3 }); }
