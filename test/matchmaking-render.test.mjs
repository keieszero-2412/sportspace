import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React, { useEffect, useRef, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transform } from 'esbuild';

// Render the real component offline. Effects do not execute on the server.
const original = fs.readFileSync(new URL('../src/components/MatchmakingSection.jsx', import.meta.url), 'utf8');
const icons = [...new Set(original.match(/\bIcon[A-Z]\w+/g))];
const source = original.replace(/^import[\s\S]*?from\s+["'][^"']+["'];\s*/gm, '')
  .replace('export default function', 'function');
const { code } = await transform(source, { loader: 'jsx' });
const rows = Array.from({ length: 400 }, (_, i) => ({
  id: `m-${i}`, title: `Match ${i}`, sport: 'Pickleball', province: 'Hà Nội',
  venueName: `Local fixture ${i}`, time: '19:00 - 20:00',
  startAt: Date.now() + 86400000, status: 'open', playersMax: 4, playersJoined: 1,
}));
const empty = () => null;
const names = ['React', 'useEffect', 'useRef', 'useState', 'api', 'publicMatchFeed', 'localDate', 'normalize',
  'useToast', 'ConfirmModal', 'AsyncStatus', 'getCurrentPosition', 'getDistance', ...icons];
const values = [React, useEffect, useRef, useState, () => { throw new Error('No live API permitted'); },
  { read: () => rows, subscribe: () => { throw new Error('No live subscription permitted'); } },
  () => '2026-10-10', value => value, () => ({ showError: empty, showSuccess: empty }),
  empty, empty, empty, empty, ...icons.map(() => empty)];
const Component = new Function(...names, `${code}; return MatchmakingSection;`)(...values);

test('warm feed renders 24 cards while counts and filters retain all 400 matches', () => {
  const html = renderToStaticMarkup(React.createElement(Component));
  assert.equal((html.match(/<article\b/g) || []).length, 24);
  assert.match(html, /400/);
  assert.match(html, /Xem thêm kèo/);
  assert.match(html, /Local fixture 23/);
  assert.doesNotMatch(html, /Local fixture 24</);
  assert.match(html, /Pickleball/);
  assert.doesNotMatch(html, /Match \d+/);
});
test('English matchmaking retains a localized load-more action', () => {
  const html = renderToStaticMarkup(React.createElement(Component, { lang: 'en' }));
  assert.match(html, /Show more matches/);
  assert.match(html, /active matches/);
});

test('full matches stay visible for joined users and hosts, not unrelated visitors', () => {
  const saved = rows.slice();
  try {
    rows.splice(0, rows.length,
      { ...saved[0], venueName: 'Full joined match', playersJoined: 4, joinedUsers: ['u1'] },
      { ...saved[1], venueName: 'Full hosted match', playersJoined: 4, hostId: 'u1' },
      { ...saved[2], venueName: 'Full unrelated match', playersJoined: 4, joinedUsers: ['u2'], hostId: 'u2' },
    );
    const html = renderToStaticMarkup(React.createElement(Component, { userProfile: { uid: 'u1' } }));
    assert.match(html, /Full joined match/);
    assert.match(html, /Full hosted match/);
    assert.doesNotMatch(html, /Full unrelated match/);
  } finally { rows.splice(0, rows.length, ...saved); }
});

test('legacy localized titles do not override the sport-only heading', () => {
  const saved = rows[0];
  try {
    rows[0] = { ...saved, sport: 'Tennis', title: 'Tennis: Structured practice',
      titleVi: 'Tennis: Luyện tập có tổ chức', titleEn: 'Tennis: Structured practice' };
    for (const lang of ['vi', 'en']) {
      const html = renderToStaticMarkup(React.createElement(Component, { lang }));
      assert.match(html, />Tennis</);
      assert.doesNotMatch(html, /Structured practice|Luyện tập có tổ chức/);
    }
  } finally { rows[0] = saved; }
});

test('creation and editing submit a sport-only title; profile does not display old titles', () => {
  assert.match(original, /\.\.\.form,\s*title: form\.sport,/);
  assert.doesNotMatch(original, /title: tr\("Tiêu đề"/);
  const profile = fs.readFileSync(new URL('../src/components/UserProfileModal.jsx', import.meta.url), 'utf8');
  assert.match(profile, /\{m\.sport\}/);
  assert.doesNotMatch(profile, /\{m\.title\}/);
  const hero = fs.readFileSync(new URL('../src/components/HeroSection.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(hero, /raw\.titleVi|raw\.titleEn|m\.title/);
});
