import fs from 'node:fs';
import dotenv from 'dotenv';
import postgres from 'postgres';
const env={...dotenv.parse(fs.readFileSync('.env','utf8')),...process.env};
if(env.VITE_SUPABASE_URL!=='https://dzpbnvpqkwsjlvdxwwub.supabase.co')throw new Error('Project mismatch');
const sql=postgres(env.MY_SUPABASE_DB_URL,{max:1,connection:{default_transaction_read_only:'on',statement_timeout:20000}});
try {
  const triggers=await sql`select t.tgname,pg_get_functiondef(t.tgfoid) as definition from pg_trigger t
    where t.tgrelid='public."Users"'::regclass and not t.tgisinternal`;
  for(const trigger of triggers) console.log(JSON.stringify(trigger));
  const policies=await sql`select policyname,roles,cmd,qual,with_check from pg_policies where schemaname='public' and tablename in ('Users','VenueDataReviews')`;
  for(const policy of policies) console.log(JSON.stringify(policy));
  const defs=await sql`select pg_get_functiondef('auth.uid()'::regprocedure) as uid_definition`;
  console.log(JSON.stringify(defs));
}finally{await sql.end({timeout:3});}
