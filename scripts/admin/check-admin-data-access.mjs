import fs from 'node:fs';
import dotenv from 'dotenv';
import postgres from 'postgres';
const env={...dotenv.parse(fs.readFileSync('.env','utf8')),...process.env};
if(env.VITE_SUPABASE_URL!=='https://dzpbnvpqkwsjlvdxwwub.supabase.co')throw new Error('Project mismatch');
const sql=postgres(env.MY_SUPABASE_DB_URL,{max:1,connect_timeout:12,connection:{default_transaction_read_only:'on',statement_timeout:15000}});
try{
  const columns=await sql`select table_name,column_name from information_schema.columns where table_schema='public' and table_name in ('Facilities','MerchantApplications','VenueDataReviews') order by table_name,ordinal_position`;
  console.log(JSON.stringify({columns}));
  const permissions=await sql`select c.relname,c.relrowsecurity,has_table_privilege('authenticated',c.oid,'SELECT') as authenticated_read
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('Facilities','MerchantApplications','VenueDataReviews')`;
  console.log(JSON.stringify({permissions}));
  const policies=await sql`select tablename,policyname,qual from pg_policies where schemaname='public' and tablename in ('Facilities','MerchantApplications','VenueDataReviews')`;
  console.log(JSON.stringify({policies}));
}finally{await sql.end({timeout:3});}
