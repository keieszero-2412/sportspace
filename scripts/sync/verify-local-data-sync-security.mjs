import fs from 'node:fs';
import dotenv from 'dotenv';
import postgres from 'postgres';
const env={...dotenv.parse(fs.readFileSync('.env','utf8')),...process.env};
if(env.VITE_SUPABASE_URL!=='https://dzpbnvpqkwsjlvdxwwub.supabase.co')throw new Error('Project mismatch');
const sql=postgres(env.MY_SUPABASE_DB_URL,{max:1,connect_timeout:12,connection:{default_transaction_read_only:'on',statement_timeout:30000}});
try{
  const [security]=await sql`select
    has_table_privilege('anon','public."VenueReviewCatalog"','SELECT') as anon_catalog_read,
    has_table_privilege('authenticated','public."VenueReviewCatalog"','INSERT') as client_catalog_write,
    has_schema_privilege('authenticated','sportspace_archive','USAGE') as client_archive_access,
    has_schema_privilege('anon','sportspace_archive','USAGE') as anon_archive_access,
    (select relrowsecurity from pg_class where oid='public."VenueReviewCatalog"'::regclass) as catalog_rls`;
  if(security.anon_catalog_read||security.client_catalog_write||security.client_archive_access||security.anon_archive_access||!security.catalog_rls)throw new Error('Unexpected access permissions');
  const [admin]=await sql`select id from public."Users" where role='admin' order by id limit 1`;
  if(!admin)throw new Error('Admin missing');
  const rows=await sql.begin(async tx=>{
    await tx`select set_config('request.jwt.claims',${JSON.stringify({sub:admin.id,role:'authenticated'})},true)`;
    await tx`set local role authenticated`;
    const [allowed]=await tx`select count(*)::int as count from public."VenueReviewCatalog"`;
    await tx`select set_config('request.jwt.claims',${JSON.stringify({sub:'00000000-0000-4000-8000-000000000999',role:'authenticated'})},true)`;
    const [denied]=await tx`select count(*)::int as count from public."VenueReviewCatalog"`;
    return {adminCatalogRows:allowed.count,nonAdminCatalogRows:denied.count};
  });
  if(rows.adminCatalogRows!==1||rows.nonAdminCatalogRows!==0)throw new Error('Catalog RLS failed');
  const [size]=await sql`select pg_database_size(current_database())::text as database_bytes`;
  console.log(JSON.stringify({verified:true,...security,...rows,...size}));
}finally{await sql.end({timeout:3});}
