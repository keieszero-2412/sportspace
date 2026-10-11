import test from 'node:test';
import assert from 'node:assert/strict';
import { performMatchAction, watchMatchUpdates } from '../src/services/matchUpdates.js';
import { watchProfileRecords } from '../src/services/profileData.js';

test('only successful interactions publish server-confirmed patches and refresh', async () => {
  const calls = [];
  const stop = watchMatchUpdates(() => calls.push('profile'));
  const feed = { applyPatch: (id, patch) => calls.push([id, patch]), refresh: () => calls.push('refresh') };
  try {
    for (const operation of ['join', 'leave', 'cancel']) {
      const patch = { updatedAt: 123, operation };
      await performMatchAction(async () => patch, feed, 'matchTransition', { matchId: 'm1', operation });
      assert.deepEqual(calls.splice(0), [['m1', patch], 'profile', 'refresh']);
    }
    await assert.rejects(performMatchAction(async () => { throw new Error('match-full'); }, feed,
      'matchTransition', { matchId: 'm1', operation: 'join' }), /match-full/);
    assert.deepEqual(calls, []);
  } finally { stop(); }
});

test('profile refreshes after local interaction even without realtime delivery; cleanup stops refreshes', async () => {
  let reads = 0;
  const query = { select() { return this; }, or() { return this; }, order() { return this; },
    limit() { reads++; return Promise.resolve({ data: [], error: null }); } };
  const channel = { on() { return this; }, subscribe() { return this; } };
  const client = { from: () => query, channel: () => channel, removeChannel() {} };
  const stop = watchProfileRecords(client, 'matches', 'u1', () => {}, error => { throw error; });
  const feed = { applyPatch() {}, refresh() {} };
  await performMatchAction(async () => ({}), feed, 'matchTransition', { matchId: 'm1', operation: 'join' });
  assert.equal(reads, 2);
  stop();
  await performMatchAction(async () => ({}), feed, 'matchTransition', { matchId: 'm1', operation: 'leave' });
  assert.equal(reads, 2);
});
