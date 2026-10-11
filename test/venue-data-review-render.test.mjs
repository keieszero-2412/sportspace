import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React, { useEffect } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transform } from 'esbuild';
import sources from './fixtures/venue-review-catalog.mjs';
import { venueReviewQueue, topVenueChoices } from '../src/services/venueReviewQueue.js';
const source = fs.readFileSync(new URL('../src/components/VenueDataReview.jsx', import.meta.url), 'utf8')
  .replace(/^import[^\n]*\n/gm, '').replace('export default function', 'function');
const { code } = await transform(source, { loader: 'jsx' });
function render(field, lang = 'vi', props = {}) {
  let index = 0;
  const venue = { id: 'VN_0007', name: 'Giảng Võ Club', address: '15 Ngõ 29 Láng Hạ',
    phone: '0598370497', image: 'https://example.com/current.jpg', price_summary: 'Old price' };
  const values = { 2: [venue], 3: 1912, 4: venue, 5: field, 9: false };
  const useState = initial => {
    const current = index++;
    return [Object.hasOwn(values, current) ? values[current] : typeof initial === 'function' ? initial() : initial, () => {}];
  };
  const forbidden = () => { throw new Error('No live calls allowed'); };
  const Component = new Function('React', 'useState', 'useEffect', 'supabase', 'api', 'useToast', 'AsyncStatus', 'emptyReviewCatalog', 'venueReviewQueue', 'topVenueChoices', `${code};return VenueDataReview;`)(
    React, useState, useEffect, { from: forbidden }, forbidden,
    () => ({ showSuccess: forbidden, showError: forbidden }), () => null, sources, venueReviewQueue, topVenueChoices,
  );
  return renderToStaticMarkup(React.createElement(Component, { lang, ...props }));
}

test('focused admin hides unrelated coverage and only offers manual search without suitable candidates', () => {
  const html = render('image', 'vi', { focused: true });
  assert.match(html, /Cần duyệt/);
  assert.match(html, /Nhiều lựa chọn/);
  assert.match(html, /Chưa có nguồn phù hợp/);
  assert.doesNotMatch(html, /Độ phủ nguồn cần duyệt|Danh sách thiếu nguồn|Tìm bổ sung theo tên và địa chỉ sân/);
  assert.match(html, /Chọn ảnh này/);
  assert.match(html, /Duyệt ảnh \(đúng sân, có quyền sử dụng\)/);
  assert.match(html, /Không cần thay thế ảnh/);
  assert.ok(html.indexOf('Chuyển sân duyệt') < html.indexOf('admin-venue-grid'));
  assert.doesNotMatch(html, /<textarea|type="checkbox"|admin-review-form/);
  assert.ok((html.match(/class="admin-source-card/g) || []).length <= 3);
});
test('focused approval advances only on success without popups or toasts', async () => {
  const first={id:'VN_0007',name:'Giảng Võ',image:'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b6/Pickle_Pro_Tour_2025_2.jpg/800px-Pickle_Pro_Tour_2025_2.jpg'};
  const second={id:'VN_0002',name:'My Dink',image:'https://example.test/second.jpg'};
  const state={2:[first,second],3:2,4:first,5:'image',9:false};
  let index=0,request,fail=false;
  const useState=initial=>{
    const slot=index++;
    if(!Object.hasOwn(state,slot))state[slot]=typeof initial==='function'?initial():initial;
    return[state[slot],value=>{state[slot]=typeof value==='function'?value(state[slot]):value;}];
  };
  const forbidden=()=>{throw new Error('No popup, toast or live calls allowed');};
  const Component=new Function('React','useState','useEffect','supabase','api','useToast','AsyncStatus','emptyReviewCatalog','venueReviewQueue','topVenueChoices',`${code};return VenueDataReview;`)(React,useState,()=>{},{from:forbidden},async(action,data)=>{request={action,data};if(fail)throw new Error('Conflict');return{...first,image:data.value};},()=>({showError:forbidden,showSuccess:forbidden}),()=>null,sources,venueReviewQueue,topVenueChoices);
  const nodes=value=>Array.isArray(value)?value.flatMap(nodes):React.isValidElement(value)?[value,...nodes(value.props.children)]:[];
  const tree=()=>{index=0;return nodes(Component({lang:'vi',focused:true}));};
  const approve=()=>tree().find(node=>node.type==='button'&&String(node.props.children).startsWith('Duyệt ảnh ('));
  fail=true;await approve().props.onClick();assert.equal(state[4].id,first.id);assert.equal(state[10].message,'Conflict');
  state[10]=null;fail=false;await approve().props.onClick();
  assert.equal(state[4].id,second.id);assert.equal(request.data.identityConfirmed,true);assert.equal(request.data.rightsConfirmed,true);
  assert.equal(request.data.expected,first.image);assert.ok(request.data.sourceUrl);assert.ok(request.data.evidence);
  // Keeping also uses the persisted approval API, not local-only progress.
  state[4]=first;state[10]=null;
  const currentImage=tree().find(node=>node.type==='img'&&node.props.alt==='Ảnh hiện tại');
  let blocked=tree().find(node=>node.type==='button'&&node.props.children==='Không cần thay thế ảnh');
  assert.equal(blocked.props.disabled,true);
  const previousRequest=request;
  await blocked.props.onClick();assert.equal(request,previousRequest);
  currentImage.props.onError();
  const original=tree().find(node=>node.type==='img'&&node.props.alt==='Ảnh hiện tại');
  assert.equal(original.props.src,'https://upload.wikimedia.org/wikipedia/commons/b/b6/Pickle_Pro_Tour_2025_2.jpg');
  original.props.onError();
  assert.equal(tree().find(node=>node.type==='button'&&node.props.children==='Không cần thay thế ảnh').props.disabled,true);
  tree().find(node=>node.type==='button'&&node.props.children==='Tải lại ảnh').props.onClick();
  tree().find(node=>node.type==='img'&&node.props.alt==='Ảnh hiện tại').props.onLoad();
  const keep=tree().find(node=>node.type==='button'&&node.props.children==='Không cần thay thế ảnh');
  assert.equal(keep.props.disabled,false);
  await keep.props.onClick();
  assert.equal(request.action,'reviewVenueData');assert.equal(request.data.operation,'approve');
  assert.equal(request.data.value,first.image);assert.equal(request.data.expected,first.image);
  assert.match(request.data.evidence,/no replacement is needed/);
  assert.equal(state[4].id,second.id);
  assert.equal(tree().find(node=>node.type==='button'&&node.props.children==='Không cần thay thế ảnh').props.disabled,true);
});

test('admin image review shows live current venue, evidence, selection and permission controls', () => {
  const html = render('image');
  assert.match(html, /Giảng Võ Club/);
  assert.match(html, /Duyệt nguồn ảnh, điện thoại và giá sân/);
  assert.match(html, /Mở trang nguồn/);
  assert.match(html, /Chọn ảnh này/);
  assert.match(html, /Ảnh đã chọn để thay thế/);
  assert.match(html, /Có quyền sử dụng ảnh/);
  assert.match(html, /disabled=""[^>]*>Lưu ảnh đã chọn/);
});

test('selecting an image previews and submits that exact candidate, not the first/default image', async () => {
  const venue = { id:'VN_0007', name:'Giảng Võ Club', image:'https://example.com/current.jpg' };
  const state = {2:[venue],3:1,4:venue,5:'image',9:false};
  let index = 0, request;
  const useState = initial => {
    const slot = index++;
    if (!Object.hasOwn(state,slot)) state[slot] = typeof initial === 'function' ? initial() : initial;
    return [state[slot], value => { state[slot] = typeof value === 'function' ? value(state[slot]) : value; }];
  };
  const forbidden = () => { throw new Error('No live calls allowed'); };
  const Component = new Function('React','useState','useEffect','supabase','api','useToast','AsyncStatus','emptyReviewCatalog',`${code};return VenueDataReview;`)(
    React,useState,()=>{}, {from:forbidden},async (action,data) => { request={action,data};return {...venue,image:data.value}; },
    ()=>({showSuccess:()=>{},showError:forbidden}),()=>null,sources);
  const tree = () => {index=0;return Component({lang:'vi'});};
  const nodes = value => Array.isArray(value) ? value.flatMap(nodes) : React.isValidElement(value)
    ? [value,...nodes(value.props.children)] : [];
  const buttons = (value,label) => nodes(value).filter(node=>node.type==='button' && node.props.children===label);
  assert.equal(buttons(tree(),'Lưu ảnh đã chọn')[0].props.disabled,true);
  const choices = buttons(tree(),'Chọn ảnh này');
  assert.ok(choices.length >= 2);
  choices[1].props.onClick();
  const expected = sources.venues[venue.id].image[1];
  assert.equal(state[6].value,expected.value);
  assert.equal(state[6].sourceUrl,expected.sourceUrl);
  assert.ok(nodes(tree()).some(node=>node.type==='img' && node.props.alt==='Xem trước ảnh đã chọn' && node.props.src===expected.value));
  assert.equal(buttons(tree(),'Đã chọn')[0].props['aria-pressed'],true);
  assert.equal(buttons(tree(),'Lưu ảnh đã chọn')[0].props.disabled,true);
  state[6]={...state[6],identityConfirmed:true,rightsConfirmed:true,license:'Owner permission'};
  const save=buttons(tree(),'Lưu ảnh đã chọn')[0];
  assert.equal(save.props.disabled,false);
  await save.props.onClick();
  assert.equal(request.action,'reviewVenueData');
  assert.equal(request.data.value,expected.value);
  assert.equal(request.data.id,expected.id);
  assert.equal(request.data.expected,venue.image);
});
test('phone tab compares the suspect current value with documented candidates', () => {
  const html = render('phone');
  assert.match(html, /0598370497/);
  assert.match(html, /0832012345/);
  assert.match(html, /sanpick.com/);
  assert.match(html, /Lý do từ chối/);
});

test('image-only picker exposes choices without the page-wide venue list or coverage', () => {
  const html=render('image','vi',{imageOnly:true});
  assert.match(html,/Chọn ảnh để thay thế/);
  assert.match(html,/Chọn ảnh này/);
  assert.match(html,/Lưu ảnh đã chọn/);
  assert.doesNotMatch(html,/Độ phủ nguồn cần duyệt|Tìm sân để duyệt|Danh sách thiếu nguồn/);
});

test('coverage shows missing sources separately from approval history', () => {
  const html = render('phone');
  assert.match(html, /Độ phủ nguồn cần duyệt/);
  assert.match(html, /Sân thiếu nguồn/);
  assert.match(html, /Danh sách thiếu nguồn/);
  assert.match(html, /không giả định bằng 0 khi lỗi/);
});
test('English price review includes price units and warns against changing checkout prices', () => {
  const html = render('price_summary', 'en');
  assert.match(html, /reference prices do not affect checkout/);
  assert.match(html, /Court hour/);
  assert.match(html, /Half-court hour/);
  assert.match(html, /Selected \/ manual value/);
  assert.match(html, /Review history/);
});
