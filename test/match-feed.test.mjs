import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { createMatchFeed, matchFeedQuery, openMatches } from '../src/services/matchFeed.js';

const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const match = (id, startAt = 2000) => ({ id, status: 'open', startAt, playersMax: 4, playersJoined: 1 });
function fakeClient(responses = []) {
  const calls = [], pending = [];
  let event, removed = 0, channels = 0;
  const client = {
    from(table) {
      const call = { table }; calls.push(call);
      const query = {
        select(value) { call.select = value; return this; },
        or(value) { call.or = value; return this; },
        eq(field, value) { call.eq = [field, value]; return this; },
        gt(field, value) { call.gt = [field, value]; return this; },
        order() { return this; }, limit(value) { call.limit = value; return this; },
        abortSignal(signal) {
          call.signal = signal;
          if (responses.length) return Promise.resolve(responses.shift());
          return new Promise(resolve => pending.push(resolve));
        },
      };
      return query;
    },
    channel() { channels++; return { on(_, __, handler) { event = handler; return this; }, subscribe() { return this; } }; },
    removeChannel() { removed++; },
  };
  return { client, calls, pending, event: () => event(), get channels() { return channels; }, get removed() { return removed; } };
}

test('confirmed membership updates immediately and stale reads cannot roll it back', async () => {
  const fake = fakeClient([{ data: [{ ...match('a'), raw_data: { joinedUsers: ['host'], playersJoined: 1 } }] }]);
  const feed = createMatchFeed(fake.client, { now: () => 1000, debounceMs: 1 });
  const received = [];
  const stop = feed.subscribe(rows => received.push(rows));
  await tick();
  const oldRead = feed.refresh();
  feed.applyPatch('a', { joinedUsers: ['host', 'u1'], playersJoined: 2 });
  assert.deepEqual(received.at(-1)[0].joinedUsers, ['host', 'u1']);
  assert.equal(received.at(-1)[0].playersJoined, 2);
  fake.pending.shift()({ data: [match('a')], error: null });
  await oldRead;
  assert.equal(feed.read()[0].playersJoined, 2);
  await new Promise(resolve => setTimeout(resolve, 10));
  fake.pending.shift()({ data: [{ ...match('a'), joinedUsers: ['host', 'u1'], playersJoined: 2 }], error: null });
  await tick();
  feed.applyPatch('a', { status: 'cancelled' });
  assert.deepEqual(feed.read(), []);
  stop();
});

test('created matches and edited details publish without waiting for realtime', async () => {
  const fake = fakeClient([{ data: [] }]);
  const feed = createMatchFeed(fake.client, { now: () => 1000 });
  const stop = feed.subscribe(() => {});
  await tick();
  feed.applyPatch('new', { ...match('new'), raw_data: { title: 'Original' } });
  assert.equal(feed.read()[0].title, 'Original');
  feed.applyPatch('new', { title: 'Edited', playersMax: 8 });
  assert.equal(feed.read()[0].title, 'Edited');
  assert.equal(feed.read()[0].playersMax, 8);
  stop();
});

test('query filters upcoming matches on the server including raw-only imports', async () => {
  let request;
  const client = createClient('http://offline.test', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async url => { request = new URL(url); return new Response('[]', { headers: { 'Content-Type': 'application/json' } }); } },
  });
  await matchFeedQuery(client, 1000);
  assert.equal(request.searchParams.get('or'), '(and(status.eq.open,startAt.gt.1000),and(raw_data->>status.eq.open,raw_data->startAt.gt.1000))');
  assert.equal(request.searchParams.get('limit'), '1000');
  assert.equal(request.searchParams.get('order'), 'startAt.asc.nullslast,id.asc');
  await matchFeedQuery(client, 1000, true);
  assert.equal(request.searchParams.get('raw_data->>status'), 'eq.open');
  assert.equal(request.searchParams.get('raw_data->startAt'), 'gt.1000');
});

test('normalization preserves imported details, row identity and all future matches', () => {
  const rows = [match('b'), { id: 'a', raw_data: { ...match('wrong-id'), titleEn: 'Imported title', joinedUsers: ['u1'] } },
    match('expired', 500), { ...match('cancelled'), status: 'cancelled' }];
  const result = openMatches(rows, 1000);
  assert.deepEqual(result.map(row => row.id), ['a', 'b']);
  assert.equal(result[0].titleEn, 'Imported title');
  assert.deepEqual(result[0].joinedUsers, ['u1']);
  assert.equal(openMatches(Array.from({ length: 400 }, (_, i) => match(String(i))), 1000).length, 400);
});

test('preview and matchmaking share one request, one channel and warm cache', async () => {
  const fake = fakeClient(), feed = createMatchFeed(fake.client, { now: () => 1000 });
  const preview = [], full = [];
  const stopPreview = feed.subscribe(rows => preview.push(rows));
  const stopFull = feed.subscribe(rows => full.push(rows));
  assert.equal(fake.calls.length, 1);
  assert.equal(fake.channels, 1);
  fake.pending.shift()({ data: [match('a')], error: null });
  await tick();
  assert.equal(preview.length, 1); assert.equal(full.length, 1);
  stopFull(); assert.equal(fake.removed, 0);
  const again = [];
  const stopAgain = feed.subscribe(rows => again.push(rows));
  assert.equal(again.length, 1);
  assert.equal(fake.calls.length, 1);
  stopAgain(); stopPreview(); assert.equal(fake.removed, 1);
});

test('expired cache is shown immediately while a fresh read updates subscribers', async () => {
  let currentTime = 1000;
  const fake = fakeClient([{ data: [match('old', 100000)] }]);
  const feed = createMatchFeed(fake.client, { now: () => currentTime });
  const stopPreview = feed.subscribe(() => {});
  await tick(); currentTime = 32000;
  const received = [];
  const stopFull = feed.subscribe(rows => received.push(rows));
  assert.equal(received[0][0].id, 'old');
  assert.equal(fake.calls.length, 2);
  fake.pending.shift()({ data: [match('new', 100000)] }); await tick();
  assert.equal(received[1][0].id, 'new');
  stopFull(); stopPreview();
});

test('only an identified missing promoted column gets the explicit legacy query', async () => {
  const fake = fakeClient([{ error: { code: '42703', message: 'column Matches.startAt does not exist' } }, { data: [{ id: 'old', raw_data: match('old') }] }]);
  const warnings = [], errors = [], values = [];
  const feed = createMatchFeed(fake.client, { now: () => 1000, warn: value => warnings.push(value) });
  const stop = feed.subscribe(rows => values.push(rows), error => errors.push(error));
  await tick();
  assert.equal(fake.calls.length, 2); assert.equal(warnings.length, 1); assert.equal(errors.length, 0);
  assert.equal(fake.calls[1].eq[0], 'raw_data->>status');
  assert.equal(values[0][0].id, 'old'); stop();
});

test('permission or missing-table errors are not hidden as empty lists', async () => {
  for (const code of ['42501', 'PGRST205']) {
    const fake = fakeClient([{ error: { code, message: 'unavailable' } }]);
    const values = [], errors = [], feed = createMatchFeed(fake.client);
    const stop = feed.subscribe(rows => values.push(rows), error => errors.push(error));
    await tick(); assert.equal(values.length, 0); assert.equal(errors[0].code, code); assert.equal(fake.calls.length, 1); stop();
  }
});

test('timeout ends loading, preserves cache, and allows retry', async () => {
  const fake = fakeClient([{ data: [match('a')] }]);
  const errors = [], feed = createMatchFeed(fake.client, { now: () => 1000, timeoutMs: 20 });
  const stop = feed.subscribe(() => {}, error => errors.push(error));
  await tick(); await feed.refresh();
  assert.match(errors[0].message, /timed out/);
  assert.equal(fake.calls[1].signal.aborted, true);
  assert.equal(feed.read()[0].id, 'a');
  const retry = feed.refresh(); fake.pending.pop()({ data: [match('b')] }); await retry;
  assert.equal(feed.read()[0].id, 'b'); stop();
});

test('closing all subscribers aborts and suppresses late responses', async () => {
  const fake = fakeClient(), values = [], errors = [];
  const feed = createMatchFeed(fake.client);
  const stop = feed.subscribe(rows => values.push(rows), error => errors.push(error));
  stop(); fake.pending.shift()({ data: [match('late')] }); await tick();
  assert.equal(fake.calls[0].signal.aborted, true);
  assert.equal(values.length, 0); assert.equal(errors.length, 0); assert.equal(feed.read(), undefined);
});

test('realtime bursts coalesce and mutations during an initial read are revalidated', async () => {
  const fake = fakeClient(), feed = createMatchFeed(fake.client, { now: () => 1000, debounceMs: 5 });
  const stop = feed.subscribe(() => {});
  void feed.refresh(); // Mutation arrives while initial response is in flight.
  fake.pending.shift()({ data: [match('old')] }); await tick();
  await new Promise(resolve => setTimeout(resolve, 12));
  assert.equal(fake.calls.length, 2);
  fake.pending.shift()({ data: [match('new')] }); await tick();
  fake.event(); fake.event(); fake.event();
  await new Promise(resolve => setTimeout(resolve, 12));
  assert.equal(fake.calls.length, 3);
  fake.pending.shift()({ data: [] }); await tick();
  assert.deepEqual(feed.read(), []); stop();
});
