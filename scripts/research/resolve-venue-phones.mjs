// Explicit user-authorized blanket phone approval and reversible hiding only.
import fs from 'node:fs';
import dotenv from 'dotenv';
import postgres from 'postgres';
import crypto from 'node:crypto';
import {bulkPhonePlan} from '../lib/bulk-phone-plan.mjs';
import {venueReview} from '../../supabase/functions/sportspace/venueData.js';
const apply=process.argv.includes('--apply');
const env={...dotenv.parse(fs.readFileSync('.env','utf8')),...process.env};
if(env.VITE_SUPABASE_URL!=='https://dzpbnvpqkwsjlvdxwwub.supabase.co')throw new Error('Project mismatch');
const sql=postgres(env.MY_SUPABASE_DB_URL,{max:1,connect_timeout:12,connection:{default_transaction_read_only:apply?'off':'on',statement_timeout:30000}});
try{
  if(process.argv.includes('--verify')){
    const [record]=await sql`select payload->'phoneBulkResolution' as run from public."VenueReviewCatalog" where id='venues'`;
    if(!record?.run)throw new Error('No bulk resolution audit');
    const rows=await sql`select id,phone,phone_status,phone_sources from public."Facilities" order by id`;
    const [reviews]=await sql`select count(*)::int as count from public."VenueDataReviews" where key like ${'bulk-phone-'+record.run.id+'-%'}`;
    const visible=rows.filter(row=>row.phone_status==='sourced'&&row.phone&&row.phone_sources?.some(source=>source.phone===row.phone));
    const [missing]=await sql`select count(*)::int as count from public."Facilities" f where f.phone_status='sourced' and not exists
      (select 1 from public."VenueDataReviews" r where r."facilityId"=f.id and r.field='phone' and r.status='approve' and r.data->>'value'=f.phone)`;
    console.log(JSON.stringify({audit:record.run,total:rows.length,visible:visible.length,hidden:rows.filter(row=>row.phone_status==='hidden_no_source').length,
      currentPhonesWithoutApproval:missing.count,runApprovalRecords:reviews.count},null,2));
    if(!record.run.finished||missing.count||reviews.count!==record.run.approvedCandidates)throw new Error('Bulk phone verification incomplete');
  }else{
    const venues=await sql`select id,name,phone,phone_status from public."Facilities" order by id`;
    const [catalog]=await sql`select payload from public."VenueReviewCatalog" where id='venues'`;
    const history=await sql`select id,"facilityId",field,status,data,"createdAt" from public."VenueDataReviews" where field='phone' order by "createdAt" desc`;
    if(!catalog?.payload?.phoneResearch?.finished)throw new Error('Finish the second public-source research pass before resolving phones');
    const byVenue=new Map();for(const row of history){if(!byVenue.has(row.facilityId))byVenue.set(row.facilityId,[]);byVenue.get(row.facilityId).push(row);}
    const plans=venues.map(venue=>({venue,...bulkPhonePlan(venue,catalog.payload.venues[venue.id]?.phone||[],byVenue.get(venue.id)||[])}));
    const counts={total:venues.length,approveVenues:plans.filter(plan=>plan.action==='approve').length,
      keepVenues:plans.filter(plan=>plan.action==='keep').length,hideVenues:plans.filter(plan=>plan.action==='hide').length,
      approvalRecords:plans.reduce((sum,plan)=>sum+plan.candidates.length,0),excludedCandidates:plans.reduce((sum,plan)=>sum+plan.excluded,0)};
    console.log(JSON.stringify({mode:apply?'apply':'audit',plan:counts}));
    if(apply){
      const [actor]=await sql`select id from public."Users" where lower(email)='keieszero2412@gmail.com' and coalesce(role,raw_data->>'role')='admin'`;
      if(!actor)throw new Error('Authorized admin profile missing');
      const run={id:crypto.randomUUID(),startedAt:new Date().toISOString(),actor:actor.id,plan:counts,
        approvedVenues:0,approvedCandidates:0,hiddenVenues:0,concurrentSkips:0,finished:false,
        method:'User authorized all candidates; similarity threshold 50 is not verified ownership; missing numbers hidden, not deleted'};
      const active=plans.filter(plan=>plan.action!=='keep');
      for(let offset=0;offset<active.length;offset+=100){
        const batch=active.slice(offset,offset+100).map(plan=>{
          let expected=plan.venue.phone??null;
          const reviews=plan.candidates.map((candidate,index)=>{
            const review=venueReview({facilityId:plan.venue.id,id:candidate.id,key:`bulk-phone-${run.id}-${candidate.id}`,
              field:'phone',operation:'approve',value:candidate.value,expected,sourceUrl:candidate.sourceUrl,identityConfirmed:true,
              evidence:`User requested blanket approval, including low-confidence candidates; not verified by phone call.\n${candidate.sourceName||''}\n${candidate.sourceAddress||''}\n${candidate.evidence}`},
              {uid:actor.id,role:'admin'},Date.now());
            review.metadata.phone_approval_method='user_requested_bulk_50';
            review.metadata.phone_match_score=Number(candidate.score)||null;
            if(index===plan.candidates.length-1)review.metadata.phone_sources=[...new Map(plan.selectedSources.map(source=>[source.sourceUrl,
              {url:source.sourceUrl,phone:source.value,evidence:source.evidence}])).values()];
            expected=review.value;return review;
          });
          return{id:plan.venue.id,action:plan.action,expectedPhone:plan.venue.phone??null,expectedStatus:plan.venue.phone_status??null,
            primary:plan.selected?.value||null,reviews};
        });
        const result=await sql.begin(async tx=>{
          await tx`set local lock_timeout='5s'`;
          // Session-local function: server-side ordered loop removes per-candidate network round trips.
          await tx.unsafe(`create or replace function pg_temp.resolve_phone_batch(actor text,plans jsonb,run_id text)
            returns jsonb language plpgsql as $body$
            declare item jsonb; review jsonb; before_row jsonb; after_row jsonb; approvals int:=0; approved_venues int:=0; hidden int:=0; skipped int:=0;
              phone_keys text[]:=array['phone','phone_status','phone_sources','phone_checked_at','phone_approval_method','phone_match_score','phone_hidden_at','phone_hidden_by','phone_hidden_reason'];
            begin
              for item in select value from jsonb_array_elements(plans) loop
                select to_jsonb(f.*) into before_row from public."Facilities" f where id=item->>'id' for update;
                if before_row is null then raise exception 'facility-not-found'; end if;
                if before_row->'phone' is distinct from item->'expectedPhone' or before_row->'phone_status' is distinct from item->'expectedStatus' then skipped:=skipped+1; continue; end if;
                if item->>'action'='approve' then
                  for review in select value from jsonb_array_elements(item->'reviews') loop
                    if review->>'field'<>'phone' or review->>'operation'<>'approve' then raise exception 'phone-only-batch'; end if;
                    perform public.review_venue_data(actor,review);approvals:=approvals+1;
                  end loop;
                  approved_venues:=approved_venues+1;
                elsif item->>'action'='hide' then
                  if exists(select 1 from public."VenueDataReviews" r where r."facilityId"=item->>'id' and r.field='phone' and r.status='approve' and r.data->'value'=before_row->'phone') then skipped:=skipped+1;continue;end if;
                  update public."Facilities" set phone_status='hidden_no_source',raw_data=coalesce(raw_data,'{}'::jsonb)||jsonb_build_object(
                    'phone_status','hidden_no_source','phone_hidden_at',now(),'phone_hidden_by',actor,'phone_hidden_reason','No usable public source after bounded second pass','phone_hidden_run',run_id)
                    where id=item->>'id';hidden:=hidden+1;
                else raise exception 'invalid-phone-batch-action';end if;
                select to_jsonb(f.*) into after_row from public."Facilities" f where id=item->>'id';
                if before_row-array['phone','phone_status','phone_sources','phone_checked_at','raw_data'] is distinct from after_row-array['phone','phone_status','phone_sources','phone_checked_at','raw_data'] then raise exception 'unrelated-field-changed';end if;
                if coalesce(nullif(before_row->'raw_data','null'::jsonb),'{}'::jsonb)-phone_keys-array['phone_hidden_run'] is distinct from coalesce(nullif(after_row->'raw_data','null'::jsonb),'{}'::jsonb)-phone_keys-array['phone_hidden_run'] then raise exception 'unrelated-metadata-changed';end if;
                if item->>'action'='approve' and after_row->>'phone' is distinct from item->>'primary' then raise exception 'primary-phone-mismatch';end if;
              end loop;
              return jsonb_build_object('approvedCandidates',approvals,'approvedVenues',approved_venues,'hiddenVenues',hidden,'concurrentSkips',skipped);
            end $body$`);
          const [result]=await tx`select pg_temp.resolve_phone_batch(${actor.id},${tx.json(batch)}::jsonb,${run.id}) as stats`;
          const updated={...run};for(const [key,value] of Object.entries(result.stats))updated[key]+=value;
          updated.finished=offset+100>=active.length;updated.updatedAt=new Date().toISOString();
          await tx`update public."VenueReviewCatalog" set payload=jsonb_set(payload,'{phoneBulkResolution}',${tx.json(updated)}::jsonb),"updatedAt"=now() where id='venues'`;
          return updated;
        });
        Object.assign(run,result);console.log(JSON.stringify({processed:Math.min(offset+100,active.length),...run}));
      }
      if(!active.length)console.log(JSON.stringify({alreadyResolved:true}));
    }
  }
}finally{await sql.end({timeout:3});}
