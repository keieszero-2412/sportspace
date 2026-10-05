import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { fetchProfileRecords, watchProfileRecords } from '../src/services/profileData.js';

function clientWithResponse(response, status = 200) {
  const requests = [];
  const client = createClient('http://offline.test', 'offline-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async url => {
      requests.push(new URL(url));
      return new Response(JSON.stringify(response), { status, headers: { 'Content-Type': 'application/json' } });
    } },
  });
  return { client, requests };
}

test('match membership filters JSON on the server and flattens imported records', async () => {
  const { client, requests } = clientWithResponse([{ id: 'match', raw_data: { title: 'Offline match', joinedUsers: ['u1'] } }]);
  const rows = await fetchProfileRecords(client, 'matches', 'u1');
  assert.equal(rows[0].title, 'Offline match');
  assert.equal(requests[0].searchParams.get('raw_data'), 'cs.{"joinedUsers":["u1"]}');
  assert.equal(requests[0].searchParams.get('order'), 'raw_data->createdAt.desc,id.desc');
  assert.equal(requests[0].searchParams.has('joinedUsers'), false);
});

test('booking pages always scope to the user and include the timestamp tie-breaker', async () => {
  const { client, requests } = clientWithResponse([]);
  const before = { id: 'booking-100', createdAt: '2026-10-05T00:00:00Z' };
  await fetchProfileRecords(client, 'bookings', 'u1', { before, limit: 100 });
  assert.equal(requests[0].searchParams.get('userId'), 'eq.u1');
  assert.equal(requests[0].searchParams.get('order'), 'createdAt.desc,id.desc');
  assert.equal(requests[0].searchParams.get('or'), '(createdAt.lt."2026-10-05T00:00:00Z",and(createdAt.eq."2026-10-05T00:00:00Z",id.lt."booking-100"))');
});

test('missing schema and denied access remain errors, not empty histories', async () => {
  for (const [code, status] of [['PGRST205', 404], ['42501', 403]]) {
    const { client } = clientWithResponse({ code, message: 'unavailable' }, status);
    await assert.rejects(fetchProfileRecords(client, 'bookings', 'u1'), error => error.code === code);
  }
});

test('a valid empty history succeeds; an absent user cannot issue an unscoped read', async () => {
  const { client, requests } = clientWithResponse([]);
  assert.deepEqual(await fetchProfileRecords(client, 'credibility', 'u1'), []);
  await assert.rejects(fetchProfileRecords(client, 'bookings', ''), /Invalid profile query/);
  assert.equal(requests.length, 1);
});

test('closing a profile suppresses pending updates and releases its subscription', async () => {
  let complete, removed = false;
  const notifications = [];
  const query = {
    select() { return this; }, eq() { return this; }, order() { return this; },
    limit() { return new Promise(resolve => { complete = resolve; }); },
  };
  const channel = { on() { return this; }, subscribe() { return this; } };
  const client = { from: () => query, channel: () => channel, removeChannel: value => { assert.equal(value, channel); removed = true; } };
  const stop = watchProfileRecords(client, 'bookings', 'u1', rows => notifications.push(rows), error => notifications.push(error));
  stop();
  complete({ data: [{ id: 'late' }], error: null });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(removed, true);
  assert.deepEqual(notifications, []);
});
