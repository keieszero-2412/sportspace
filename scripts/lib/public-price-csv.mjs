import fs from 'node:fs';
export function parseCsv(text) {
 text=text.replace(/^\uFEFF/,'');
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quoted){if(c==='"'&&text[i+1]==='"'){cell+='"';i++;}else if(c==='"')quoted=false;else cell+=c;}
  else if(c==='"')quoted=true;
  else if(c===','){row.push(cell);cell='';}
  else if(c==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';}
  else cell+=c;
 }
 if(quoted)throw new Error('Unterminated CSV quotation');
 if(cell||row.length){row.push(cell.replace(/\r$/,''));rows.push(row);}
 const headers=rows.shift()||[];
 return rows.filter(r=>r.some(Boolean)).map(r=>{if(r.length!==headers.length)throw new Error(`CSV columns: ${r.length}, expected ${headers.length}`);return Object.fromEntries(headers.map((h,i)=>[h,r[i]]));});
}
export const readCsv=file=>parseCsv(fs.readFileSync(file,'utf8'));
export function writeCsv(file,rows,headers=Object.keys(rows[0]||{})){
 const cell=v=>'"'+String(v??'').replaceAll('"','""')+'"';
 fs.writeFileSync(file,'\uFEFF'+headers.map(cell).join(',')+'\n'+rows.map(r=>headers.map(h=>cell(r[h])).join(',')).join('\n')+'\n');
}
