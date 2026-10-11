import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../src/services/api.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('export function watch('),source.indexOf('export function watchProfile(')).replace('export function','function');
test('admin watch retains Supabase error code and does not turn missing data into success',async()=>{
  let received=false,reported;
  const query={select(){return this},eq(){return this},limit(){return this},async abortSignal(){return{error:{code:'PGRST205',message:'Missing MerchantApplications'}}}};
  const watch=new Function('supabase',`${code};return watch;`)({from:()=>query});
  const stop=watch('MerchantApplications',[['status','==','pending']],()=>{received=true},error=>{reported=error});
  await new Promise(resolve=>setTimeout(resolve,10));
  stop();
  assert.equal(received,false);
  assert.equal(reported.code,'PGRST205');
  assert.match(reported.message,/MerchantApplications/);
});
