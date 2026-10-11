// Explicit recovery utility; requires --restore and refuses existing files.
// No Firebase reads. Archive data is available only to the DB operator.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import dotenv from 'dotenv';
import postgres from 'postgres';
if(!process.argv.includes('--restore'))throw new Error('Use --restore with --archive=<id>; restores archived local data, not production tables.');
const archive=process.argv.find(arg=>arg.startsWith('--archive='))?.slice(10);
if(!/^[0-9a-f-]{36}$/.test(archive||''))throw new Error('Archive id required');
const prefix=process.argv.find(arg=>arg.startsWith('--prefix='))?.slice(9)||'';
if(prefix.includes('..')||prefix.startsWith('/')||prefix.includes('\\'))throw new Error('Invalid prefix');
const env={...dotenv.parse(fs.readFileSync('.env','utf8')),...process.env};
if(env.VITE_SUPABASE_URL!=='https://dzpbnvpqkwsjlvdxwwub.supabase.co')throw new Error('Project mismatch');
const sql=postgres(env.MY_SUPABASE_DB_URL,{max:1,connect_timeout:12,connection:{default_transaction_read_only:'on',statement_timeout:60000}});
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const root=path.resolve('.');
try{
  const [manifest]=await sql`select data from sportspace_archive.manifests where id=${archive}`;
  if(!manifest)throw new Error('Archive missing');
  const files=manifest.data.files.filter(file=>file.path.startsWith(prefix));
  if(!files.length)throw new Error('No matching archived files');
  for(const file of files){
    const target=path.resolve(root,file.path);
    if(!target.startsWith(root+path.sep)||fs.existsSync(target))throw new Error('Unsafe or existing target: '+file.path);
  }
  const selected=new Set(files.map(file=>file.path));let restored=0;
  for(let index=0;index<manifest.data.parts.length;index++){
    if(!manifest.data.parts[index].some(file=>selected.has(file.path)))continue;
    const [part]=await sql`select payload,sha256 from sportspace_archive.parts where archive_id=${archive} and part_index=${index}`;
    if(!part||hash(part.payload)!==part.sha256)throw new Error('Corrupt archive part');
    for(const file of JSON.parse(gunzipSync(part.payload).toString()).files){
      if(!selected.has(file.path))continue;
      const bytes=Buffer.from(file.base64,'base64');
      if(hash(bytes)!==file.sha256||bytes.length!==file.bytes)throw new Error('Corrupt archived file');
      const target=path.resolve(root,file.path);
      // Check every existing ancestor for reparse/symlink redirection.
      let parent=path.dirname(target);
      while(parent!==root){if(fs.existsSync(parent)&&fs.lstatSync(parent).isSymbolicLink())throw new Error('Symlink target');parent=path.dirname(parent);}
      fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes,{flag:'wx'});restored++;
    }
  }
  console.log(JSON.stringify({restored,archive}));
}finally{await sql.end({timeout:3});}
