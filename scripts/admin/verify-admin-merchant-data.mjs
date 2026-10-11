import fs from 'node:fs';
import dotenv from 'dotenv';
import postgres from 'postgres';
import assert from 'node:assert/strict';
const env={...dotenv.parse(fs.readFileSync('.env','utf8')),...process.env};
if(env.VITE_SUPABASE_URL!=='https://dzpbnvpqkwsjlvdxwwub.supabase.co')throw new Error('Project mismatch');
const sql=postgres(env.MY_SUPABASE_DB_URL,{max:1,connect_timeout:12,connection:{statement_timeout:20000}});
const rollback=new Error('EXPECTED_ROLLBACK'),fixture=crypto.randomUUID(),owner=crypto.randomUUID();
try{
  const [admin]=await sql`select u.id from public."Users" u join auth.users a on a.id::text=u.id where u.role='admin' limit 1`;
  assert.ok(admin);
  const [security]=await sql`select c.relrowsecurity as rls,has_table_privilege('anon',c.oid,'SELECT') as anon_read,
    has_table_privilege('authenticated',c.oid,'INSERT') as direct_write from pg_class c where c.oid='public."MerchantApplications"'::regclass`;
  assert.equal(security.rls,true);assert.equal(security.anon_read,false);assert.equal(security.direct_write,false);
  try{
    await sql.begin(async tx=>{
      await tx`insert into public."MerchantApplications" (id,"userId","venueName","venueAddress",status) values (${fixture},${owner},'Rollback fixture','Not a real venue','pending')`;
      await tx`set local role authenticated`;
      for(const [sub,expected]of [[admin.id,1],[owner,1],[crypto.randomUUID(),0]]){
        await tx`select set_config('request.jwt.claims',${JSON.stringify({sub,role:'authenticated'})},true)`;
        const [count]=await tx`select count(*)::int as count from public."MerchantApplications" where id=${fixture} and status='pending'`;
        assert.equal(count.count,expected);
      }
      throw rollback;
    });
  }catch(error){if(error!==rollback)throw error;}
  const [fixtureCount]=await sql`select count(*)::int as count from public."MerchantApplications" where id=${fixture}`;
  assert.equal(fixtureCount.count,0);
  console.log(JSON.stringify({adminRead:true,ownerRead:true,otherUserBlocked:true,anonymousBlocked:true,directWriteBlocked:true,fixturesRolledBack:true}));
}finally{await sql.end({timeout:3});}
