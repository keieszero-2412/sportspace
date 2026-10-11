// Diagnostic download into OS temporary storage only, never into project datasets.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const urls=process.argv.slice(2);if(!urls.length)throw new Error('Specify public photo URLs');
const directory=await fs.mkdtemp(path.join(os.tmpdir(),'sportspace-photo-preview-'));
for(let index=0;index<urls.length;index++){
  const url=new URL(urls[index]);if(url.protocol!=='https:'||url.hostname!=='images.pexels.com'||url.username||url.password)throw new Error('Only public Pexels photo previews');
  const response=await fetch(url,{signal:AbortSignal.timeout(7000),redirect:'manual'});if(!response.ok)throw new Error(`HTTP ${response.status}`);
  let bytes=0;const chunks=[];for await(const chunk of response.body){bytes+=chunk.length;if(bytes>3000000)throw new Error('Preview too large');chunks.push(chunk);}
  const filename=path.join(directory,`${index}.jpg`);await fs.writeFile(filename,Buffer.concat(chunks));console.log(filename);
}
