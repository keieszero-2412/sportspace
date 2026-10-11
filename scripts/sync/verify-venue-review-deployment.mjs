import fs from 'node:fs';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import postgres from 'postgres';
import { venueReview } from '../../supabase/functions/sportspace/venueData.js';
const env = { ...dotenv.parse(fs.readFileSync('.env','utf8')), ...process.env };
const base = env.VITE_SUPABASE_URL;
if (base !== 'https://dzpbnvpqkwsjlvdxwwub.supabase.co') throw new Error('Project mismatch');
const sql = postgres(env.MY_SUPABASE_DB_URL,{max:1,connect_timeout:12,connection:{statement_timeout:20000}});
const rollback = new Error('EXPECTED_TEST_ROLLBACK');
try {
  const [before] = await sql`select count(*)::int as count from public."VenueDataReviews"`;
  const [admin] = await sql`select u.id from public."Users" u join auth.users a on a.id::text=u.id
    where coalesce(u.role,u.raw_data->>'role')='admin' order by u.id limit 1`;
  if (!admin) console.log(JSON.stringify({adminFlowVerified:false,reason:'No Supabase Auth user with matching admin profile',rollbackTestsSkipped:true}));
  if (admin) {
  const [venue] = await sql`select id,image,phone,phone_status,phone_sources,phone_checked_at,price_summary,raw_data
    from public."Facilities" order by id limit 1`;
  try {
    await sql.begin(async tx => {
      await tx`set local lock_timeout='5s'`;
      const dto = venueReview({facilityId:venue.id,key:crypto.randomUUID(),field:'image',operation:'approve',
        value:venue.image,expected:venue.image,sourceUrl:'https://example.com/deployment-rollback-test',
        evidence:'Rollback-only deployment verification; not an actual source approval.',
        identityConfirmed:true,rightsConfirmed:true,license:'Rollback test, never persisted'},
        {uid:admin.id,role:'admin'},Date.now());
      await tx`select public.review_venue_data(${admin.id},${tx.json(dto)}::jsonb)`;
      await tx`select public.review_venue_data(${admin.id},${tx.json(dto)}::jsonb)`;
      const [applied] = await tx`select id,image,phone,phone_status,phone_sources,phone_checked_at,price_summary,raw_data
        from public."Facilities" where id=${venue.id}`;
      for (const field of ['phone','phone_status','phone_sources','phone_checked_at','price_summary']) assert.deepEqual(applied[field],venue[field]);
      for (const [field,value] of Object.entries(venue.raw_data || {})) assert.deepEqual(applied.raw_data[field],value);
      const [history] = await tx`select count(*)::int as count from public."VenueDataReviews" where key=${dto.key}`;
      assert.equal(history.count,1);
      await assert.rejects(tx.savepoint(async sp => sp`select public.review_venue_data(${admin.id},${sp.json({...dto,key:crypto.randomUUID(),expected:'stale value'})}::jsonb)`),/venue-data-changed/);
      await assert.rejects(tx.savepoint(async sp => sp`select public.review_venue_data(${admin.id},${sp.json({...dto,value:'https://example.com/different.jpg'})}::jsonb)`),/review-key-conflict/);
      await assert.rejects(tx.savepoint(async sp => sp`select public.review_venue_data('not-an-admin',${sp.json(dto)}::jsonb)`),/admin-required/);
      const rejected = {...dto,key:crypto.randomUUID(),operation:'reject',reason:'Rollback test'};
      await tx`select public.review_venue_data(${admin.id},${tx.json(rejected)}::jsonb)`;
      const [afterReject] = await tx`select raw_data from public."Facilities" where id=${venue.id}`;
      assert.deepEqual(afterReject.raw_data,applied.raw_data);
      await tx.savepoint(async sp => {
        await sp`set local role authenticated`;
        await sp`select set_config('request.jwt.claims',${JSON.stringify({sub:admin.id,role:'authenticated'})},true)`;
        const [identity]=await sp`select auth.uid()::text=${admin.id} as claims_match,
          (select count(*)::int from public."Users" where id=${admin.id} and role='admin') as visible_admin_profile`;
        console.log(JSON.stringify({rlsIdentity:identity}));
        const [visible] = await sp`select count(*)::int as count from public."VenueDataReviews" where key=${dto.key}`;
        assert.equal(visible.count,1);
        await sp`select set_config('request.jwt.claims',${JSON.stringify({sub:'00000000-0000-0000-0000-000000000000',role:'authenticated'})},true)`;
        const [hidden] = await sp`select count(*)::int as count from public."VenueDataReviews" where key=${dto.key}`;
        assert.equal(hidden.count,0);
        await sp`reset role`;
      });
      console.log(JSON.stringify({rpcTests:true,idempotency:true,casConflict:true,keyConflict:true,adminGuard:true,rejectionPreservesVenue:true,rlsAdminVisibility:true}));
      throw rollback;
    });
  } catch(error) { if(error !== rollback) throw error; }
  const [after] = await sql`select count(*)::int as count from public."VenueDataReviews"`;
  assert.equal(after.count,before.count);
  const [restored] = await sql`select id,image,phone,phone_status,phone_sources,phone_checked_at,price_summary,raw_data from public."Facilities" where id=${venue.id}`;
  assert.deepEqual(restored,venue);
  console.log(JSON.stringify({rollbackVerified:true,persistedTestReviews:0}));
  }
  const headers = {apikey:env.VITE_SUPABASE_ANON_KEY,'Content-Type':'application/json'};
  const read = await fetch(`${base}/rest/v1/VenueDataReviews?select=id&limit=1`,{headers,signal:AbortSignal.timeout(15000)});
  assert.ok([401,403].includes(read.status),`Anonymous read unexpectedly allowed: ${read.status}`);
  const options = await fetch(`${base}/functions/v1/sportspace`,{method:'OPTIONS',signal:AbortSignal.timeout(15000)});
  assert.equal(options.status,200);
  const action = await fetch(`${base}/functions/v1/sportspace`,{method:'POST',headers,body:JSON.stringify({action:'reviewVenueData',data:{}}),signal:AbortSignal.timeout(20000)});
  const result = await action.json();
  assert.ok(result.error && !/BOOT_ERROR|WORKER_ERROR|not supported/i.test(JSON.stringify(result)), 'Worker boot/auth guard failed');
  console.log(JSON.stringify({anonymousHistoryStatus:read.status,workerOptionsStatus:options.status,unauthenticatedActionBlocked:true}));
} finally { await sql.end({timeout:3}); }
