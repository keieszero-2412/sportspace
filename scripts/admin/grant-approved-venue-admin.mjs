// User explicitly approved this exact email; do not generalize this grant.
import fs from 'node:fs';
import dotenv from 'dotenv';
import postgres from 'postgres';
const email='keieszero2412@gmail.com';
const env={...dotenv.parse(fs.readFileSync('.env','utf8')),...process.env};
if(env.VITE_SUPABASE_URL!=='https://dzpbnvpqkwsjlvdxwwub.supabase.co') throw new Error('Project mismatch');
const apply=process.argv.includes('--apply');
const sql=postgres(env.MY_SUPABASE_DB_URL,{max:1,connect_timeout:12,connection:{statement_timeout:20000,...(apply?{}:{default_transaction_read_only:'on'})}});
try {
  const users=await sql`select a.id::text as id, a.email, u.id is not null as profile_exists,
    u.role, u.raw_data->>'role' as raw_role, jsonb_typeof(u.raw_data) as raw_type from auth.users a left join public."Users" u on u.id=a.id::text
    where lower(a.email)=${email}`;
  if(users.length!==1) throw new Error(`Expected exactly one Auth account for approved email; found ${users.length}`);
  const user=users[0];
  console.log(JSON.stringify({email,profileExists:user.profile_exists,role:user.role,rawRole:user.raw_role,rawType:user.raw_type}));
  if(!user.profile_exists) throw new Error('Approved Auth account lacks a matching profile; no user profile created automatically');
  if(apply) {
    await sql.begin(async tx=>{
      await tx`set local lock_timeout='5s'`;
      // Legacy string metadata is preserved; canonical role is the authority.
      const rows=await tx`update public."Users" u set role='admin',raw_data=case when jsonb_typeof(u.raw_data)='object'
        then u.raw_data||jsonb_build_object('role','admin') else u.raw_data end
        from auth.users a where u.id=${user.id} and a.id::text=u.id and lower(a.email)=${email}
        returning u.role,u.raw_data->>'role' as raw_role`;
      if(rows.length!==1 || rows[0].role!=='admin' || user.raw_type==='object' && rows[0].raw_role!=='admin') {
        console.log(JSON.stringify({returnedRoles:rows}));
        throw new Error('Admin grant verification failed');
      }
    });
    console.log(JSON.stringify({email,adminGranted:true,affectedProfiles:1,authAccountUnchanged:true}));
  }
} finally {await sql.end({timeout:3});}
