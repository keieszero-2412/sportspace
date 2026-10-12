import fs from 'node:fs';
import dotenv from 'dotenv';
import postgres from 'postgres';

dotenv.config({ quiet: true });
if (process.env.VITE_SUPABASE_URL !== 'https://dzpbnvpqkwsjlvdxwwub.supabase.co') {
  throw new Error('Unexpected Supabase project');
}
const sql = postgres(process.env.MY_SUPABASE_DB_URL, {
  max: 1, connect_timeout: 10,
  connection: { statement_timeout: 60000, lock_timeout: 10000 },
});
try {
  if (process.argv.includes('--apply')) {
    const migration = fs.readFileSync(new URL('../../supabase/migrations/20261012000000_simulated_match_schedule.sql', import.meta.url), 'utf8');
    await sql.unsafe(migration);
    console.log(JSON.stringify(await sql`select public.refresh_simulated_match_schedule() result`));
  }
  console.log(JSON.stringify(await sql`
    select status,count(*)::int total from public."SimulatedBookings" group by status
  `));
  console.log(JSON.stringify(await sql`
    select jobname,schedule,active from cron.job where jobname='sportspace-simulated-match-schedule'
  `));
  console.log(JSON.stringify(await sql`
    select count(*)::int invalid_links from public."SimulatedBookings" b
    left join public."Availability" a on a."bookingId"=b.id
    left join public."Matches" m on m.id=b."matchId"
    where a.id is null or (b."matchId" is not null and m.id is null) or a."courtId"<>b."courtId"
      or a."startAt"<>b."startAt" or a."endAt"<>b."endAt"
  `));
} finally { await sql.end({ timeout: 3 }); }
