import test from 'node:test';
import assert from 'node:assert/strict';
import { authRedirectUrl, consumeAuthError, profileForUser, fetchWithTimeout } from '../src/services/auth.js';
import { profilePatch, saveProfile } from '../supabase/functions/sportspace/profile.js';

const user = { id: 'test-auth-id', email: 'player@example.test', user_metadata: { full_name: 'Google Player', phone: '0900000000', admin: true } };

test('a missing profile preserves verified identity and Google display name', () => {
  const profile = profileForUser(user, null);
  assert.equal(profile.uid, user.id);
  assert.equal(profile.name, 'Google Player');
  assert.equal(profile.phone, '0900000000');
  assert.equal(profile.isAdmin, false);
  assert.deepEqual(profile.savedVenueIds, []);
});

test('profile data cannot change identity or grant admin through user metadata', () => {
  const profile = profileForUser(user, { uid: 'wrong', raw_data: { id: 'wrong', email: 'wrong', isAdmin: true, favoriteSports: '["Tennis"]', savedVenueIds: 'invalid' } });
  assert.equal(profile.id, user.id);
  assert.equal(profile.email, user.email);
  assert.equal(profile.isAdmin, false);
  assert.deepEqual(profile.favoriteSports, ['Tennis']);
  assert.deepEqual(profile.savedVenueIds, []);
  assert.equal(profileForUser({ ...user, app_metadata: { admin: true } }).isAdmin, true);
});

test('canonical profile columns override stale legacy raw data', () => {
  const profile = profileForUser(user, {
    id: user.id,
    name: 'Current Name',
    raw_data: { name: 'Old Name', phone: '0911111111' },
  });
  assert.equal(profile.name, 'Current Name');
  assert.equal(profile.phone, '0911111111');
});

test('redirects exclude stale OAuth tokens and errors', () => {
  assert.equal(authRedirectUrl({ origin: 'https://sport.example', pathname: '/', search: '?error=x', hash: '#token=x' }), 'https://sport.example/');
  assert.equal(authRedirectUrl({ origin: 'http://localhost:3000', pathname: '/venue/123' }), 'http://localhost:3000/');
});

test('OAuth errors are consumed once without deleting unrelated URL parameters', () => {
  let replacement;
  const result = consumeAuthError({ pathname: '/', search: '?sport=tennis&error=denied', hash: '#error_description=Access+denied' }, { replaceState: (_state, _title, url) => replacement = url });
  assert.equal(result, 'Access denied');
  assert.equal(replacement, '/?sport=tennis');
  assert.equal(consumeAuthError({ search: '', hash: '' }, {}), null);
});

test('profile writes whitelist editable fields and use JSON arrays', () => {
  assert.deepEqual(profilePatch({ name: ' Name ', favoriteSports: [' Tennis '], role: 'admin', uid: 'other', credibilityScore: 1000 }), { name: 'Name', favoriteSports: ['Tennis'] });
});

function repository(initial = null, failure = null) {
  let row = initial;
  const writes = [];
  return {
    writes,
    from(table) {
      assert.equal(table, 'Users');
      return {
        select() { return this; },
        eq(field, id) { assert.equal(field, 'id'); assert.equal(id, user.id); return this; },
        async maybeSingle() { return { data: row, error: failure }; },
        async upsert(next, options) {
          writes.push({ next, options });
          if (!(row && options.ignoreDuplicates)) row = next;
          return { error: failure };
        },
      };
    },
  };
}

test('first login creates one profile through HTTP client; repeat initialization preserves it', async () => {
  const client = repository();
  const first = await saveProfile(client, user, { initializeOnly: true, role: 'admin' }, 0);
  assert.equal(first.uid, user.id);
  assert.equal(first.role, 'user');
  assert.equal(first.name, 'Google Player');
  assert.deepEqual(first.savedVenueIds, []);
  const second = await saveProfile(client, user, { initializeOnly: true, name: 'Overwrite' }, 1);
  assert.equal(second.name, 'Google Player');
  assert.equal(client.writes.length, 1);
  assert.equal(client.writes[0].options.ignoreDuplicates, true);
});

test('profile updates preserve server-owned role and score', async () => {
  const client = repository({ id: user.id, role: 'merchant', credibilityScore: 80, raw_data: { name: 'Original', savedVenueIds: ['saved'] } });
  const result = await saveProfile(client, user, { name: 'Edited', role: 'admin', credibilityScore: 1000 });
  assert.equal(result.name, 'Edited');
  assert.equal(result.role, 'merchant');
  assert.equal(result.credibilityScore, 80);
  assert.deepEqual(result.savedVenueIds, ['saved']);
});

test('profile errors and account deletion are not silently reported as success', async () => {
  await assert.rejects(saveProfile(repository(null, new Error('offline')), user, {}), /offline/);
  const client = repository({ raw_data: { deletionRequested: true } });
  await assert.rejects(saveProfile(client, user, {}), /account-deleting/);
  assert.equal(client.writes.length, 0);
});

test('network timeouts and caller cancellation terminate hanging requests', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (_url, { signal }) => new Promise((_resolve, reject) => {
    if (signal.aborted) reject(signal.reason);
    else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
  // AbortSignal.timeout is unref'ed in Node; keep the loop alive for the assertion.
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    await assert.rejects(fetchWithTimeout('http://offline.test', {}, 10), { name: 'TimeoutError' });
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(fetchWithTimeout('http://offline.test', { signal: controller.signal }), { name: 'AbortError' });
  } finally { clearTimeout(keepAlive); globalThis.fetch = original; }
});
