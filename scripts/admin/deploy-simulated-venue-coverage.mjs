import fs from 'node:fs';
import dotenv from 'dotenv';
import postgres from 'postgres';
dotenv.config({ quiet: true });
if (process.env.VITE_SUPABASE_URL !== 'https://dzpbnvpqkwsjlvdxwwub.supabase.co') throw new Error('Unexpected project');
const apply = process.argv.includes('--apply');
const sql = postgres(process.env.MY_SUPABASE_DB_URL, { max: 1, connect_timeout: 10,
  connection: { statement_timeout: 120000, lock_timeout: 10000, default_transaction_read_only: apply ? 'off' : 'on' } });
try {
  if (apply) {
    await sql.unsafe(fs.readFileSync(new URL('../../supabase/migrations/20261012010000_simulated_venue_coverage.sql', import.meta.url), 'utf8'));
    console.log(JSON.stringify(await sql`select public.refresh_simulated_venue_coverage() result`));
  }
  console.log(JSON.stringify(await sql`select date,count(*)::int slots,count(distinct "facilityId")::int venues
    from public."Availability" where status='booked' and "expiresAt">extract(epoch from now())*1000
    group by date order by date`));
  console.log(JSON.stringify(await sql`select count(*)::int invalid_links from public."SimulatedBookings" b
    left join public."Availability" a on a."bookingId"=b.id where b.id like 'SIM-COVERAGE-%'
      and (a.id is null or a.court_id<>b."courtId" or a.date<>b.date
        or a."startAt"<>b."startAt" or a."endAt"<>b."endAt")`));
} finally { await sql.end({ timeout: 3 }); }
