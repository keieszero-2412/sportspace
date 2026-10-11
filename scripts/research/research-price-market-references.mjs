// External sport-market references remain explicitly separate from venue quotes.
import fs from 'node:fs';
import dotenv from 'dotenv';
import postgres from 'postgres';
import crypto from 'node:crypto';
import * as cheerio from 'cheerio';
import {extractHourlyPrices,priceIdentityScore} from '../lib/venue-price-resolution.mjs';
const env={...dotenv.parse(fs.readFileSync('.env','utf8')),...process.env};
if(env.VITE_SUPABASE_URL!=='https://dzpbnvpqkwsjlvdxwwub.supabase.co')throw new Error('Project mismatch');
const sql=postgres(env.MY_SUPABASE_DB_URL,{max:1,connect_timeout:12,connection:{statement_timeout:30000}});
const tasks=[
 {url:'https://www.decathlon.vn/blog/san-bong-ban/',sport:'Bóng bàn',province:'Hà Nội',name:'CLB Bóng Bàn Ngọc Uyên',heading:/Ngọc Uyên/i,onlyPrivateTable:true},
 {url:'https://www.decathlon.vn/blog/san-bong-ban/',sport:'Bóng bàn',province:'Hồ Chí Minh',name:'CLB Bóng Bàn Ý Ping pong Quận 12',heading:/Ý Ping pong/i,onlyPrivateTable:true},
 {url:'https://www.decathlon.vn/blog/san-bong-mau-luong/',sport:'Bóng đá',province:'Hà Nội',name:'Sân bóng Mậu Lương',table:true},
 {url:'https://www.decathlon.vn/blog/san-bong-da-mini-quyen-dao-duy-anh-2/',sport:'Bóng đá',province:'Hồ Chí Minh',name:'Sân bóng đá mini Quyền Đào Duy Anh',courtFive:true},
 {url:'https://www.decathlon.vn/blog/bong-chuyen-bao-nhieu-tien/',sport:'Bóng chuyền',province:null,name:'Khảo sát sân bóng chuyền trong nhà',marketLine:/Sân trong nhà/i},
 {url:'https://www.decathlon.vn/blog/bong-chuyen-bao-nhieu-tien/',sport:'Bóng chuyền',province:null,name:'Khảo sát sân bóng chuyền ngoài trời',marketLine:/Sân ngoài trời/i},
 ];
try{
 const venues=await sql`select id,name,address,province,sport from public."Facilities" order by id`;
 const references=[],cache=new Map();
 for(const task of tasks){
  if(!cache.has(task.url)){
   const response=await fetch(task.url,{redirect:'manual',signal:AbortSignal.timeout(7000)});if(!response.ok)throw new Error(`source-http-${response.status}`);
   const chunks=[];let bytes=0;for await(const chunk of response.body){bytes+=chunk.length;if(bytes>3000000)throw new Error('source-too-large');chunks.push(chunk);}cache.set(task.url,cheerio.load(Buffer.concat(chunks).toString('utf8')));
  }
  const $=cache.get(task.url);let amounts=[],evidence='';
  if(task.onlyPrivateTable){
   $('h3').each((_,heading)=>{if(!task.heading.test($(heading).text()))return;
    $(heading).nextUntil('h1,h2,h3').find('li').each((_,item)=>{const line=$(item).text().replace(/\s+/g,' ');if(!/thuê riêng bàn/i.test(line))return;const prices=extractHourlyPrices(line);for(const price of prices){amounts.push(price.min,price.max);evidence=price.evidence;}});
   });
  }else if(task.marketLine){
   $('li').filter((_,el)=>!$(el).find('li').length).each((_,item)=>{const line=$(item).text().replace(/\s+/g,' ');if(!task.marketLine.test(line))return;
    const price=extractHourlyPrices(`Giá thuê: ${line}`)[0];if(price){amounts.push(price.min,price.max);evidence=price.evidence;}
   });
  }else if(task.courtFive){
   $('p').each((_,item)=>{const line=$(item).text().replace(/\s+/g,' ');if(!/Giá thuê sân.*VND\/giờ\/sân 5 người/.test(line))return;
    const clause=line.split(/,\s*và từ/)[0].replace(/\/sân 5 người.*$/,'');const price=extractHourlyPrices(clause)[0];
    if(price){amounts.push(price.min,price.max);evidence=clause+'; applies to five-a-side pitch only';}
   });
  }else if(task.table){
   $('table').each((_,table)=>{
    const header=$(table).find('tr').first().find('th,td').map((_,cell)=>$(cell).text()).get();
    const priceIndex=header.findIndex(text=>/giá thuê.*(?:VND|VNĐ)\s*\/\s*giờ/i.test(text));if(priceIndex<0)return;
    $(table).find('tr').slice(1).each((_,row)=>{const cells=$(row).find('td').map((_,cell)=>$(cell).text()).get();
     const price=extractHourlyPrices(`Giá thuê: ${cells[priceIndex]} VND/giờ`)[0];if(price){amounts.push(price.min,price.max);evidence+=`${cells.join(' | ')}\n`;}
    });
   });
  }
  if(!amounts.length)throw new Error(`No unambiguous rental price: ${task.name}`);
  references.push({id:crypto.createHash('sha256').update(task.url+task.name).digest('hex').slice(0,24),sport:task.sport,province:task.province,name:task.name,
   min:Math.min(...amounts),max:Math.max(...amounts),basis:'court_hour',unitMinutes:60,sourceUrl:task.url,evidence:evidence.slice(0,1600),externalMarket:true,
   courtType:task.courtFive?'five_a_side':task.table?'five_a_side':null,courtEnvironment:task.marketLine?(task.name.includes('trong nhà')?'indoor':'outdoor'):null,checkedAt:new Date().toISOString()});
 }
 await sql.begin(async tx=>{
  const [{payload}]=await tx`select payload from public."VenueReviewCatalog" where id='venues' for update`;
  payload.priceMarketReferences=references;
  for(const reference of references)for(const venue of venues){
   if(venue.sport!==reference.sport||venue.province!==reference.province||priceIdentityScore(venue,{...reference,sourceName:reference.name})===null)continue;
   payload.venues[venue.id]||={image:[],phone:[],price_summary:[]};payload.venues[venue.id].price_summary||=[];
   const candidate={...reference,id:crypto.createHash('sha256').update(venue.id+reference.id).digest('hex').slice(0,24),sourceName:reference.name,externalMarket:false,matchStatus:'live_price_name_section_50',status:'candidate_not_approved'};
   if(!payload.venues[venue.id].price_summary.some(c=>c.id===candidate.id))payload.venues[venue.id].price_summary.push(candidate);
  }
  const lists=Object.values(payload.venues).map(v=>v.price_summary||[]);payload.totals.price_summary={venues:lists.filter(l=>l.length).length,candidates:lists.reduce((n,l)=>n+l.length,0)};
  await tx`update public."VenueReviewCatalog" set payload=${tx.json(payload)},"updatedAt"=now() where id='venues'`;
 });console.log(JSON.stringify({marketReferences:references},null,2));
}finally{await sql.end({timeout:3});}
