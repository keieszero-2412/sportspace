import fs from 'node:fs';
import dotenv from 'dotenv';
import postgres from 'postgres';
const env={...dotenv.parse(fs.readFileSync('.env','utf8')),...process.env};
if(env.VITE_SUPABASE_URL!=='https://dzpbnvpqkwsjlvdxwwub.supabase.co') throw new Error('Project mismatch');
const sql=postgres(env.MY_SUPABASE_DB_URL,{max:1,connect_timeout:12,connection:{default_transaction_read_only:'on',statement_timeout:20000}});
try {
  const [stats]=await sql`select
    (select count(*)::int from public."Users" where coalesce(role,raw_data->>'role')='admin') as admin_profiles,
    (select count(*)::int from auth.users) as auth_accounts,
    (select count(*)::int from public."Users" u join auth.users a on u.id=a.id::text where coalesce(u.role,u.raw_data->>'role')='admin') as admin_auth_id_matches,
    (select count(*)::int from public."Users" u join auth.users a on lower(coalesce(u.email,u.raw_data->>'email'))=lower(a.email) where coalesce(u.role,u.raw_data->>'role')='admin') as admin_email_matches`;
  console.log(JSON.stringify(stats));
  const options=await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/sportspace`,{method:'OPTIONS',signal:AbortSignal.timeout(15000)});
  const response=await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/sportspace`,{method:'POST',headers:{apikey:env.VITE_SUPABASE_ANON_KEY,'Content-Type':'application/json'},body:JSON.stringify({action:'reviewVenueData',data:{}}),signal:AbortSignal.timeout(15000)});
  const body=await response.json();
  console.log(JSON.stringify({optionsStatus:options.status,authGuardStatus:response.status,error:body.error || body.code || null}));
} finally {await sql.end({timeout:3});}
