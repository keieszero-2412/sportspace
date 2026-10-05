// Offline integration tests: the real browser and Supabase SDK, intercepted HTTP.
// No requests are sent to a live Auth, database, Firebase, or Google service.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import { Launcher } from 'chrome-launcher';

process.env.VITE_SUPABASE_URL = 'http://127.0.0.1:54321';
process.env.VITE_SUPABASE_ANON_KEY = 'offline-test-key';
const origin = 'http://127.0.0.1:3013';
const server = await createServer({ server: { host: '127.0.0.1', port: 3013, strictPort: true, open: false } });
await server.listen();
let browser;
const uid = '00000000-0000-4000-8000-000000000001';
const user = { id: uid, aud: 'authenticated', role: 'authenticated', email: 'player@example.test', app_metadata: { provider: 'email' }, user_metadata: { name: 'Offline Player', phone: '0900000000' } };
const token = ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: uid, exp: Math.floor(Date.now()/1000)+3600 })).toString('base64url'), 'offline'].join('.');
const session = { access_token: token, refresh_token: 'offline-refresh', expires_in: 3600, token_type: 'bearer', user };
const profile = { id: uid, name: 'Offline Player', email: user.email, role: 'user', savedVenueIds: [], favoriteSports: [] };
async function clickText(page, label) {
  await page.waitForFunction(text => [...document.querySelectorAll('button')].some(b => b.textContent.trim() === text && !b.disabled), {}, label);
  await page.evaluate(text => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === text && !b.disabled).click(), label);
}
async function scenario(name, options = {}) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const calls = [];
  const errors = [];
  let bookingBlocked = options.profilePanel === 'retry';
  page.on('pageerror', e => errors.push(e.message));
  await page.setRequestInterception(true);
  page.on('request', async request => {
    const url = new URL(request.url());
    if (url.origin === origin || url.protocol === 'data:') return request.continue();
    if (url.origin !== process.env.VITE_SUPABASE_URL) return request.abort();
    const headers = { 'access-control-allow-origin': origin, 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS', 'content-type': 'application/json' };
    if (request.method() === 'OPTIONS') return request.respond({ status: 200, headers, body: '{}' });
    const body = request.postData() ? JSON.parse(request.postData()) : null;
    calls.push({ path: url.pathname, body, url: url.href });
    let status = 200, response = [];
    if (url.pathname === '/auth/v1/token') {
      response = session;
      if (options.invalidPassword) { status = 400; response = { code: 'invalid_credentials', error_code: 'invalid_credentials', message: 'Invalid login credentials' }; }
    }
    if (url.pathname === '/auth/v1/signup') response = options.confirmation ? { ...user, identities: [{ provider: 'email' }] } : session;
    if (url.pathname === '/auth/v1/user') response = user;
    if (url.pathname === '/auth/v1/authorize') {
      assert.equal(url.searchParams.get('provider'), 'google');
      assert.equal(url.searchParams.get('redirect_to'), origin+'/');
      return request.respond({ status: 302, headers: { ...headers, location: origin+'/#access_token='+token+'&refresh_token=offline-refresh&expires_in=3600&token_type=bearer&type=signup' }, body: '' });
    }
    if (url.pathname === '/functions/v1/sportspace') response = options.profileFailure ? { error: 'profile-storage-unavailable' } : { data: profile };
    if (url.pathname === '/rest/v1/Users') response = options.profileFailure ? null : profile;
    if (url.pathname === '/rest/v1/Bookings' && options.profilePanel) {
      assert.equal(url.searchParams.get('userId'), 'eq.'+uid);
      // 503 is retried automatically by the SDK; use an actionable permission
      // failure so this scenario exercises the UI's explicit Retry button.
      if (bookingBlocked) { status = 403; response = { code: '42501', message: 'Access temporarily denied' }; }
    }
    if (url.pathname === '/rest/v1/CredibilityEvents' && options.profilePanel) {
      assert.equal(url.searchParams.get('userId'), 'eq.'+uid);
      status = 403; response = { code: '42501', message: 'Access denied' };
    }
    if (url.pathname === '/rest/v1/Matches' && options.profilePanel && url.searchParams.has('raw_data')) {
      assert.equal(url.searchParams.get('raw_data'), 'cs.{"joinedUsers":["'+uid+'"]}');
      assert.equal(url.searchParams.get('order'), 'raw_data->createdAt.desc,id.desc');
      response = [{ id: 'offline-match', raw_data: { title: 'My offline match', joinedUsers: [uid] } }];
    }
    if (url.pathname.startsWith('/realtime/')) return request.abort();
    await request.respond({ status, headers, body: JSON.stringify(response) });
  });
  try {
    let path = '/';
    if (options.oauth || options.recovery) path += '#access_token='+token+'&refresh_token=offline-refresh&expires_in=3600&token_type=bearer&type='+(options.recovery ? 'recovery' : 'signup');
    if (options.oauthError) path += '?sport=tennis#error=access_denied&error_description=Google+access+denied';
    await page.goto(origin+path, { waitUntil: 'domcontentloaded', timeout: 60000 });
    if (options.oauthError) {
      await page.waitForFunction(() => document.body.innerText.includes('Google access denied'));
      assert.equal(new URL(page.url()).hash, '');
      assert.equal(new URL(page.url()).search, '?sport=tennis');
      await clickText(page, 'Đăng nhập');
      assert.ok(await page.$('input[name=email]'));
      console.log('PASS', name);
      return;
    }
    if (options.recovery) {
      await page.waitForSelector('input[name=newPassword]');
      await page.type('input[name=newPassword]', 'UpdatedOffline123!');
      await page.type('input[name=confirmPassword]', 'UpdatedOffline123!');
      await clickText(page, 'Lưu mật khẩu');
      await page.waitForSelector('input[name=newPassword]', { hidden: true });
      assert.equal(calls.find(c => c.path === '/auth/v1/user' && c.body)?.body.password, 'UpdatedOffline123!');
    } else if (!options.oauth) {
      await clickText(page, 'Đăng nhập');
      if (options.googleButton) {
        await clickText(page, 'Google');
      } else {
      if (options.signup) {
        await clickText(page, 'Đăng ký');
        await page.type('input[name=name]', 'Offline Player');
        await page.type('input[name=phone]', '0900000000');
      }
      await page.type('input[name=email]', user.email);
      await page.type('input[name=password]', 'OfflineOnly123!');
      await page.click('button[type=submit]');
      }
    }
    if (options.invalidPassword) {
      await page.waitForFunction(() => document.body.innerText.includes('Email hoặc mật khẩu không đúng'));
      assert.equal(await page.$eval('button[type=submit]', el => el.disabled), false);
      assert.equal(calls.filter(c => c.path === '/functions/v1/sportspace').length, 0);
      console.log('PASS', name);
      return;
    }
    if (options.confirmation) {
      await page.waitForFunction(() => document.body.innerText.includes('xác thực tài khoản'));
      assert.equal(calls.filter(c => c.path === '/functions/v1/sportspace').length, 0);
      assert.equal(new URL(calls.find(c => c.path === '/auth/v1/signup').url).searchParams.get('redirect_to'), origin+'/');
    } else {
      await page.waitForFunction(() => document.querySelector('header')?.innerText.includes('Offline Player'));
      await new Promise(r => setTimeout(r, 300));
      assert.ok(await page.$eval('header', el => el.innerText.includes('Offline Player')), 'valid auth session must survive missing profile');
      assert.equal(await page.$('input[name=password]'), null, 'successful auth closes modal even if profile save fails');
      assert.equal(calls.filter(c => c.path === '/functions/v1/sportspace' && c.body?.action === 'saveProfile').length, options.recovery ? 2 : 1, 'initialize once per sign-in, refresh after USER_UPDATED');
      if (options.reload) {
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => document.querySelector('header')?.innerText.includes('Offline Player'));
      }
      if (options.profilePanel) {
        const initialCalls = calls.length;
        await page.evaluate(() => [...document.querySelectorAll('header button')].find(b => b.innerText.includes('Offline Player')).click());
        await page.waitForSelector('.modal-content');
        if (options.profilePanel === 'retry') {
          await page.waitForSelector('.modal-content [role=alert]');
          bookingBlocked = false;
          await clickText(page, 'Thử lại');
        }
        await page.waitForFunction(() => document.querySelector('.modal-content [role=status]')?.textContent.includes('Chưa có dữ liệu'));
        assert.equal(await page.$('.modal-content [role=alert]'), null);
        assert.equal(calls.slice(initialCalls).some(c => c.path.endsWith('/CredibilityEvents')), false, 'closed tabs must not issue reads');
        await clickText(page, 'Kèo giao lưu (0)');
        await page.waitForFunction(() => document.querySelector('.modal-content')?.textContent.includes('My offline match'));
        await clickText(page, 'Điểm uy tín');
        await page.waitForSelector('.modal-content [role=alert]');
        await page.evaluate(() => [...document.querySelectorAll('.modal-content button')].find(b => b.textContent.includes('Lịch sử đặt sân')).click());
        await page.waitForFunction(() => document.querySelector('.modal-content [role=status]')?.textContent.includes('Chưa có dữ liệu'));
        assert.equal(await page.$('.modal-content [role=alert]'), null, 'credibility error must not poison bookings');
        await page.click('[aria-label="Đóng hồ sơ"]');
        await page.waitForSelector('.modal-content', { hidden: true });
      }
    }
    assert.deepEqual(errors, []);
    console.log('PASS', name);
  } finally { await context.close(); }
}
try {
  browser = await puppeteer.launch({ executablePath: Launcher.getInstallations()[0], headless: true, args: ['--disable-background-networking'] });
  if (!process.argv.includes('--profile-only')) {
  await scenario('password login + reload', { reload: true });
  await scenario('invalid password enables retry', { invalidPassword: true });
  await scenario('signup with immediate session', { signup: true });
  await scenario('password login with missing profile', { profileFailure: true });
  await scenario('signup with missing profile', { signup: true, profileFailure: true });
  await scenario('signup awaiting email confirmation', { signup: true, confirmation: true });
  await scenario('Google/OAuth return with missing profile', { oauth: true, profileFailure: true });
  await scenario('Google button redirects and restores session', { googleButton: true });
  await scenario('Google refusal shows error and allows retry', { oauthError: true });
  await scenario('password recovery updates password', { recovery: true });
  }
  await scenario('open profile, empty bookings, JSON matches and isolated tab errors', { profilePanel: 'empty' });
  await scenario('profile retries failed bookings without reloading the page', { profilePanel: 'retry' });
} finally {
  await browser?.close();
  await server.close();
}
