// Uses current Supabase identities, not archived exports or synthetic fixtures.
import fs from 'node:fs';
import dotenv from 'dotenv';
import postgres from 'postgres';
import crypto from 'node:crypto';
import { readPhoneContacts, phoneDecisions } from '../lib/auto-venue-phone-review.mjs';
import { venueReview } from '../../supabase/functions/sportspace/venueData.js';
const apply = process.argv.includes('--apply');
const research = apply || process.argv.includes('--research');
const env = { ...dotenv.parse(fs.readFileSync('.env', 'utf8')), ...process.env };
if (env.VITE_SUPABASE_URL !== 'https://dzpbnvpqkwsjlvdxwwub.supabase.co') throw new Error('Project mismatch');
const sql = postgres(env.MY_SUPABASE_DB_URL, { max: 1, connect_timeout: 12,
  connection: { default_transaction_read_only: apply ? 'off' : 'on', statement_timeout: 20000 } });
try {
  if (process.argv.includes('--verify')) {
    const [status] = await sql`select count(*)::int as approvals,
      count(*) filter(where f.phone=r.data->>'value' and f.phone_status='sourced'
        and f.phone_sources @> jsonb_build_array(jsonb_build_object('url',r.data->>'sourceUrl','phone',r.data->>'value')))::int as current_matches
      from public."VenueDataReviews" r join public."Facilities" f on f.id=r."facilityId"
      where r.field='phone' and r.status='approve' and r.key like 'auto-phone-v1-%'`;
    console.log(JSON.stringify({project:'dzpbnvpqkwsjlvdxwwub',verification:status}));
    if (status.approvals !== status.current_matches) throw new Error('Some approved phones no longer match current data');
  } else {
  const [catalog] = await sql`select payload from public."VenueReviewCatalog" where id='venues'`;
  if (!catalog?.payload?.venues) throw new Error('Review catalog missing');
  const venues = await sql`select id,name,address,province,sport,phone,phone_status,phone_sources,source_url from public."Facilities" order by id`;
  const candidates = Object.entries(catalog.payload.venues).flatMap(([facilityId, fields]) =>
    (fields.phone || []).map(candidate => ({ ...candidate, facilityId })));
  console.log(JSON.stringify({ venues: venues.length, phoneCandidates: candidates.length,
    domains: [...new Set(candidates.map(candidate => new URL(candidate.sourceUrl).hostname))],
    sample: research ? undefined : candidates.slice(0, 12), existingSourced: venues.filter(venue => venue.phone_status === 'sourced').length }, null, 2));
  if (research) {
    const reviews = await sql`select "facilityId",field,status,data from public."VenueDataReviews" where field='phone'`;
    const [admin] = await sql`select u.id from public."Users" u join auth.users a on a.id::text=u.id
      where lower(a.email)='keieszero2412@gmail.com' and coalesce(u.role,u.raw_data->>'role')='admin'`;
    if (apply && !admin) throw new Error('Requested admin identity is unavailable');
    const seeds = ['https://sanpick.com/san-pickleball-ha-noi/', 'https://sanpick.com/san-pickleball-ho-chi-minh/',
      'https://sanpick.com/san-pickleball-da-nang/', 'https://sanpick.com/san-pickleball-khanh-hoa/'];
    const urls = [...new Set([...seeds, ...candidates.map(candidate => candidate.sourceUrl),
      ...venues.map(venue => venue.source_url).filter(Boolean)])];
    const allowed = new Set(['sanpick.com','www.sporta.vn','sporta.vn','www.alobo.vn','diadiem247.com']);
    const blocked = new Set(), contacts = [], failures = {};
    let fetched = 0, skippedUrls = 0;
    const started = Date.now();
    const countFailure = reason => failures[reason] = (failures[reason] || 0) + 1;
    // Bounded pass: no recursive crawl, browser, CAPTCHA solving, or retry storm.
    for (const value of urls) {
      if (fetched >= 100 || Date.now() - started > 180000) { skippedUrls++; continue; }
      let url;
      try { url = new URL(value); } catch { skippedUrls++; continue; }
      if (url.protocol !== 'https:' || url.username || url.password || !allowed.has(url.hostname) || blocked.has(url.hostname)) { skippedUrls++; continue; }
      fetched++;
      try {
        const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(7000) });
        if ([401,403,429].includes(response.status)) {
          blocked.add(url.hostname);
          if (url.hostname.endsWith('sporta.vn')) { blocked.add('sporta.vn'); blocked.add('www.sporta.vn'); }
          countFailure(`blocked_${response.status}`); await response.body?.cancel(); continue;
        }
        if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) {
          countFailure(`http_${response.status}`); await response.body?.cancel(); continue;
        }
        const reader = response.body.getReader(); const chunks = []; let bytes = 0;
        for (;;) { const item = await reader.read(); if (item.done) break; bytes += item.value.length;
          if (bytes > 3000000) { await reader.cancel(); break; } chunks.push(item.value); }
        if (bytes > 3000000) { countFailure('page_too_large'); continue; }
        const html = Buffer.concat(chunks).toString('utf8');
        if (/captcha|verify you are human|unusual traffic|just a moment/i.test(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '')) {
          blocked.add(url.hostname); countFailure('access_challenge'); continue;
        }
        contacts.push(...readPhoneContacts({url: url.href,html,retrievedAt:new Date().toISOString()}));
      } catch (error) { countFailure(error.name === 'TimeoutError' ? 'timeout' : 'network_error'); }
      if (fetched % 10 === 0) console.log(JSON.stringify({fetched,contacts:contacts.length,elapsedSeconds:Math.round((Date.now()-started)/1000)}));
    }
    const { decisions, skipped } = phoneDecisions(venues,contacts,reviews);
    let approved = 0; const writeFailures = {};
    for (const decision of decisions) {
      if (!apply) continue;
      const record = decision.records[0];
      const evidence = JSON.stringify({method:'strict_live_name_address_phone_v1',sourceName:record.name,
        sourceAddress:record.address,checkedAt:record.checkedAt,evidence:record.evidence,
        sources:decision.records.map(item=>({url:item.url,name:item.name,address:item.address,phone:item.phone}))});
      const key = `auto-phone-v1-${crypto.createHash('sha256').update(JSON.stringify([decision.venue.id,decision.value,decision.venue.phone,decision.records.map(item=>item.url)])).digest('hex')}`;
      const dto = venueReview({facilityId:decision.venue.id,key,field:'phone',operation:'approve',value:decision.value,
        expected:decision.venue.phone,sourceUrl:record.url,evidence,identityConfirmed:true}, {uid:admin.id,role:'admin'},Date.now());
      try {
        await sql.begin(async tx => {
          await tx`set local lock_timeout='3s'`;
          await tx`select public.review_venue_data(${admin.id},${tx.json(dto)}::jsonb)`;
        });
        approved++;
        console.log(JSON.stringify({approvedVenue:decision.venue.id,name:decision.venue.name,phone:decision.value,source:record.url}));
      } catch (error) {
        if (/venue-data-changed/.test(error.message)) writeFailures.concurrent_change=(writeFailures.concurrent_change||0)+1;
        else throw error;
      }
    }
    console.log(JSON.stringify({mode:apply?'apply':'research',fetched,skippedUrls,contacts:contacts.length,eligible:decisions.length,
      approved,skipped,failures,writeFailures,blockedHosts:[...blocked],elapsedSeconds:Math.round((Date.now()-started)/1000),
      preview:apply?undefined:decisions.slice(0,8).map(item=>({id:item.venue.id,name:item.venue.name,phone:item.value,source:item.records[0].url}))},null,2));
  }
  }
} finally { await sql.end({ timeout: 3 }); }
