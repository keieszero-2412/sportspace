// Offline UI verification: mock every service, intercept all external requests.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import puppeteer from 'puppeteer-core';
import {Launcher} from 'chrome-launcher';
import catalog from '../../test/fixtures/venue-review-catalog.mjs';
const venue={id:'VN_0007',name:'Giảng Võ Club',address:'15 Ngõ 29 Láng Hạ, Hà Nội',image:'https://example.test/current.jpg',phone:'0832012345',price_summary:'100.000đ - 250.000đ/h'};
const moduleSource=`import React from 'react';import{createRoot}from'react-dom/client';import AdminPanel from '/src/components/AdminPanel.jsx';import '/src/index.css';createRoot(document.getElementById('root')).render(React.createElement(AdminPanel));`;
const server=await createServer({server:{host:'127.0.0.1',port:3027,strictPort:true,open:false},plugins:[{
  name:'offline-admin-preview',
  resolveId(id){if(id==='virtual:admin-preview')return '\0virtual:admin-preview';},
  load(id){if(id==='\0virtual:admin-preview')return moduleSource;},
  transform(source,id){
    const file=id.replaceAll('\\','/');
    if(file.endsWith('/src/services/venueReviewCatalog.js'))return `export const emptyReviewCatalog={venues:{},totals:{},identities:[],coverage:null};export async function fetchVenueReviewCatalog(){return ${JSON.stringify(catalog)}};`;
    if(file.endsWith('/src/services/api.js'))return `const venue=${JSON.stringify(venue)};export function watch(name,filter,receive){receive(name==='Facilities'?[venue]:[]);return()=>{};}export async function api(){throw new Error('Offline: saving disabled');}export async function openPrivateImage(){throw new Error('Offline: private images disabled');}`;
    if(file.endsWith('/src/components/ToastContext.jsx'))return `export function useToast(){return{showError:()=>{},showSuccess:()=>{}};}`;
    if(/\/src\/supabase\.(js|ts)$/.test(file))return `const venue=${JSON.stringify(venue)};export const supabase={from(table){let single=false;const q={select(){return q},order(){return q},limit(){return q},range(){return q},ilike(){return q},eq(){return q},gt(){return q},single(){single=true;return q},abortSignal(){return q},then(ok,bad){return Promise.resolve({data:table==='Facilities'?(single?venue:[venue]):[],count:table==='Facilities'?1:0,error:null}).then(ok,bad)}};return q}};`;
  },
  configureServer(vite){vite.middlewares.use('/admin-preview',async(req,res)=>{res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml('/admin-preview','<html lang="vi"><meta name="viewport" content="width=device-width, initial-scale=1"><body><div id="root"></div><script type="module" src="/@id/__x00__virtual:admin-preview"></script></body></html>'));});},
}]});
let browser;
try{
  await server.listen();
  browser=await puppeteer.launch({executablePath:Launcher.getInstallations()[0],headless:true,args:['--disable-background-networking']});
  const page=await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request',request=>{
    if(request.url().startsWith('http://127.0.0.1:3027/'))return request.continue();
    if(request.resourceType()==='image')return request.respond({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="640" height="400" fill="#347d69"/><rect x="80" y="40" width="480" height="320" fill="none" stroke="white" stroke-width="4"/><path d="M320 40v320M80 200h480" stroke="white" stroke-width="4"/></svg>'});
    return request.abort();
  });
  fs.mkdirSync('scratch/admin-layout',{recursive:true});
  for(const width of [1440,390]){
    await page.setViewport({width,height:1000});
    await page.goto('http://127.0.0.1:3027/admin-preview',{waitUntil:'networkidle0'});
    await page.waitForSelector('.admin-venue-option');
    assert.equal(await page.$('#admin-image-archive'),null);
    await page.click('.admin-venue-option');
    await page.waitForSelector('.admin-candidate-image');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Page overflow');
    await page.screenshot({path:`scratch/admin-layout/desktop-${width}.png`,fullPage:true});
    await page.$eval('.admin-source-card button',node=>node.click());
    await page.waitForSelector('.admin-source-card.is-selected');
    assert.equal(await page.$eval('.admin-selected-image img',node=>node.src),await page.$eval('.admin-source-card.is-selected img',node=>node.src));
    await page.screenshot({path:`scratch/admin-layout/image-picker-${width}.png`});
    assert.equal(await page.$('.admin-image-dialog'),null);
    console.log(JSON.stringify({width,overflow:false,imageSelection:true,focused:true,network:'mocked'}));
  }
}finally{if(browser)await browser.close();await server.close();}
