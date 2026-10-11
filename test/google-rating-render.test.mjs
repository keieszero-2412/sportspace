import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transform } from 'esbuild';
import { getGoogleRating } from '../src/services/googleRating.js';

// Render the actual shared component offline, without any backend requests.
const source = fs.readFileSync(new URL('../src/components/GoogleRating.jsx', import.meta.url), 'utf8')
  .replace(/^import .*;\r?$/gm, '').replace('export default function', 'function');
const { code } = await transform(source, { loader: 'jsx' });
const Icon = () => null;
const GoogleRating = new Function('React', 'Star', 'ExternalLink', 'getGoogleRating', `${code}; return GoogleRating;`)(React, Icon, Icon, getGoogleRating);
const render = (venue, lang = 'vi') => renderToStaticMarkup(React.createElement(GoogleRating, { venue, lang }));

test('shared rating component displays existing remote and imported scores', () => {
  assert.match(render({ rating: 4.9 }), /4\.9/);
  assert.match(render({ google_rating: null, raw_data: { rating: 4.8 } }), /4\.8/);
  assert.match(render({ google_rating: 4.7, google_reviews_count: 25 }), /25 đánh giá/);
});
test('missing rating only shows Maps link without a missing-rating message or fabricated score', () => {
  const vi = render({ name: 'Sân A', rating: null });
  assert.doesNotMatch(vi, /Chưa có|chưa có|0\.0/);
  assert.match(vi, /data-rating-available="false"/);
  assert.match(vi, /https:\/\/www.google.com\/maps\/search/);
  assert.doesNotMatch(vi, /0\.0/);
  assert.doesNotMatch(render({}, 'en'), /No rating available/);
});
