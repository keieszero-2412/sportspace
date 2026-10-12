// Explicit integration check: all test writes are rolled back, no Firebase.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import postgres from 'postgres';
dotenv.config({ quiet: true });
if (process.env.VITE_SUPABASE_URL !== 'https://dzpbnvpqkwsjlvdxwwub.supabase.co') throw new Error('Unexpected project');
const sql = postgres(process.env.MY_SUPABASE_DB_URL, { max: 1, connect_timeout: 10,
  connection: { statement_timeout: 30000, lock_timeout: 5000 } });
const rollback = new Error('intentional test rollback');
let results;
try {
  await sql.begin(async tx => {
    const [idempotent] = await tx`select public.refresh_simulated_match_schedule() result`;
    assert.equal(idempotent.result.newSimulatedBookings, 0);
    const [sample] = await tx`select m.id,m."courtId",m."startAt",m."endAt" from public."Matches" m
      join public."SimulatedBookings" b on b."matchId"=m.id where b.status='simulated' order by m.id limit 1`;
    assert(sample);
    await tx`update public."Matches" set "startAt"="startAt"+60000,"endAt"="endAt"+60000 where id=${sample.id}`;
    const [edited] = await tx`select a."startAt",a."endAt" from public."Availability" a
      join public."SimulatedBookings" b on b.id=a."bookingId" where b."matchId"=${sample.id}`;
    assert.equal(Number(edited.startAt), Number(sample.startAt)+60000);
    assert.equal(Number(edited.endAt), Number(sample.endAt)+60000);
    await tx`update public."Matches" set status='cancelled' where id=${sample.id}`;
    const [cancelled] = await tx`select a.status from public."Availability" a
      join public."SimulatedBookings" b on b.id=a."bookingId" where b."matchId"=${sample.id}`;
    assert.equal(cancelled.status, 'cancelled');
    // Exercise the future branch with the same SQL, but isolated clock and rollback.
    const migration = fs.readFileSync(new URL('../../supabase/migrations/20261012000000_simulated_match_schedule.sql', import.meta.url), 'utf8');
    let routine = migration.slice(migration.indexOf('create or replace function public.refresh_simulated_match_schedule()'),
      migration.indexOf('revoke all on function public.refresh_simulated_match_schedule()'));
    routine = routine.replace('public.refresh_simulated_match_schedule()', 'pg_temp.test_future_simulated_schedule()')
      .replace("floor(extract(epoch from clock_timestamp())*1000)", "floor(extract(epoch from timestamptz '2026-11-01 00:00:00+07')*1000)")
      .replace("(now() at time zone 'Asia/Ho_Chi_Minh')::date", "date '2026-11-01'");
    await tx.unsafe(routine);
    const [future] = await tx`select pg_temp.test_future_simulated_schedule() result`;
    assert(future.result.newMatches > 0);
    assert(future.result.newSimulatedBookings > 0);
    const [invalid] = await tx`select count(*)::int total from public."SimulatedBookings" b
      left join public."Availability" a on a."bookingId"=b.id where a.id is null
      or a."courtId"<>b."courtId" or a."startAt"<>b."startAt" or a."endAt"<>b."endAt"`;
    assert.equal(invalid.total, 0);
    const [repeat] = await tx`select pg_temp.test_future_simulated_schedule() result`;
    assert.equal(repeat.result.newMatches, 0);
    assert.equal(repeat.result.newSimulatedBookings, 0);
    results = { idempotent: true, editSync: true, cancellationSync: true, futureGeneration: future.result,
      repeatNoDuplicates: true, invalidLinks: invalid.total, testWrites: 'rolled back' };
    throw rollback;
  });
} catch (error) {
  if (error !== rollback) throw error;
  console.log(JSON.stringify(results));
} finally { await sql.end({ timeout: 3 }); }
