/* Isolated browser fixture. Uses the actual WGT CSP, Blob runtime, history,
   remote navigation and AVPlay stub. Does not represent a physical Tizen TV. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { chromium } = require('playwright');
const { build } = require('../tools/build-update.cjs');
const root = path.resolve(__dirname, '..');
const output = path.resolve(process.env.TEST_ARTIFACT_DIR || path.join(root, '.test-results'));
const KEY = 'khophim_samsung_ota_v1';
const baseBundle = JSON.parse(build().text);
const results = [];
function pass(name) { results.push(name); console.log('PASS ' + name); }
function release(version, options = {}) {
  const data = JSON.parse(JSON.stringify(baseBundle).replaceAll(baseBundle.version, version));
  if (options.broken) data.js = 'throw new Error("Update boot failure fixture");';
  const text = JSON.stringify(data) + '\n';
  const sha256 = crypto.createHash('sha256').update(text).digest('hex');
  return { text, record: { version, sha256, text }, manifest: { schema: 1, shell: options.shell || 1, version, sha256, size: Buffer.byteLength(text), bundle: 'bundles/' + sha256 + '.json' } };
}
async function main() {
  fs.mkdirSync(output, { recursive: true });
  const csp = /<tizen:content-security-policy>([^<]+)/.exec(fs.readFileSync(path.join(root, 'config.xml'), 'utf8'))[1];
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://local').pathname;
    if (pathname.includes('$WEBAPIS')) { res.setHeader('Content-Type', 'application/javascript'); res.end('/* AVPlay supplied by fixture */'); return; }
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Security-Policy', csp);
    res.setHeader('Content-Type', ({ '.js': 'application/javascript', '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.png': 'image/png' })[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'msedge' });
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    await context.addInitScript(() => {
      window.__native = [];
      window.webapis = { avplay: {
        open(url) { window.__native.push(['open', url]); }, close() {}, stop() {},
        setDisplayRect() {}, setDisplayMethod() {}, setListener(listener) { window.__avListener = listener; },
        prepareAsync(done) { setTimeout(done, 10); }, getDuration() { return 120000; },
        play() { window.__native.push(['play']); }, pause() {}, seekTo(ms, done) { done(); }
      } };
      window.tizen = { tvinputdevice: { registerKey() {} } };
    });
    let current = release('1.0.16');
    let offline = false;
    let corrupt = false;
    let manifestPatch = null;
    let holdBundle = false;
    const requested = [];
    await context.route('https://khophimqd.vercel.app/samsung/**', async route => {
      const pathname = new URL(route.request().url()).pathname;
      requested.push(pathname);
      if (offline) return route.abort();
      if (pathname.endsWith('/update.json')) return route.fulfill({ json: { ...current.manifest, ...manifestPatch }, headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' } });
      if (holdBundle) { await route.abort(); return; }
      return route.fulfill({ body: current.text + (corrupt ? 'x' : ''), contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' } });
    });
    const movie = { slug: 'tp--auto-update', name: 'Phim thử cập nhật', poster_url: 'icon.png', quality: 'HD', year: 2026 };
    await context.route('https://khophimqd.vercel.app/source/**', route => {
      if (route.request().url().includes('/source/phim/')) return route.fulfill({ json: { status: true, movie, episodes: [{ server_name: 'Lồng tiếng', server_data: [{ slug: 'tap-1', name: 'Tập 1', link_m3u8: 'https://media.example/test.m3u8' }] }] }, headers: { 'Access-Control-Allow-Origin': '*' } });
      return route.fulfill({ json: { status: true, items: [movie], data: { items: [movie], params: { pagination: { totalItems: 1, totalItemsPerPage: 6 } } } }, headers: { 'Access-Control-Allow-Origin': '*' } });
    });
    const page = await context.newPage();
    await page.route('**/announcement.json', route => route.fulfill({ json: { active: false }, headers: { 'Access-Control-Allow-Origin': '*' } }));
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const url = 'http://127.0.0.1:' + server.address().port;
    const ready = () => page.waitForFunction(() => window.KhoBoot && KhoBoot.ready);
    const staged = version => page.waitForFunction(v => KhoUpdate.info().pending === v && !KhoUpdate.info().checking, version);
    const versionIs = version => page.waitForFunction(v => window.KhoCore && KhoCore.VERSION === v && KhoBoot.ready && !JSON.parse(localStorage.getItem('khophim_samsung_ota_v1')).trial, version);
    await page.goto(url);
    await ready();
    assert.equal(await page.evaluate(() => KhoCore.VERSION), baseBundle.version);
    await page.evaluate(() => {
      localStorage.setItem('unrelated-data', 'keep');
      KhoCore.save({ slug: 'tp--auto-update', name: 'Phim thử cập nhật', positionMs: 12000, serverName: 'Lồng tiếng', episodeSlug: 'tap-1' });
    });
    const history = await page.evaluate(() => localStorage.getItem('khophim_tv_watch_history'));
    await staged('1.0.16');
    assert.equal(await page.evaluate(() => KhoCore.VERSION), baseBundle.version);
    pass('New release downloads in background without reloading the current runtime');
    await page.locator('#menu [data-tab="settings"]').click();
    await page.locator('#menu [data-tab="settings"]').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'update-check');
    await page.waitForTimeout(100);
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'update-apply');
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(output, 'samsung-auto-update.png') });
    pass('TV remote reaches check and apply controls in Settings');
    await page.locator('#update-apply').click();
    await versionIs('1.0.16');
    assert.equal(await page.evaluate(() => localStorage.getItem('khophim_tv_watch_history')), history);
    assert.equal(await page.evaluate(() => localStorage.getItem('unrelated-data')), 'keep');
    assert.equal(await page.locator('script[src^="blob:"]').count(), 1);
    pass('Verified Blob runtime boots under WGT CSP with preserved history and local origin');
    offline = true;
    await page.reload(); await versionIs('1.0.16');
    pass('Last successful update boots with update server offline');
    offline = false;
    current = release('1.0.17');
    await page.evaluate(() => KhoUpdate.check()); await staged('1.0.17');
    await page.waitForFunction(() => document.querySelector('#hero-play') && !document.querySelector('#hero-play').disabled);
    await page.locator('#hero-play').click();
    await page.waitForFunction(() => window.__native.some(call => call[0] === 'play'));
    const beforeApply = await page.evaluate(() => location.href);
    await page.evaluate(() => KhoUpdate.apply());
    assert.equal(await page.evaluate(() => location.href), beforeApply);
    assert.equal(await page.evaluate(() => KhoCore.VERSION), '1.0.16');
    assert.equal(await page.locator('#player').isVisible(), true);
    pass('Applying while AVPlay is playing cannot interrupt or restart playback');
    await page.locator('#player-back').click();
    await page.reload(); await versionIs('1.0.17');
    pass('Pending release automatically applies on next launch without confirmation');
    current = release('1.0.18', { broken: true });
    await page.evaluate(() => KhoUpdate.check()); await staged('1.0.18');
    await page.reload(); await versionIs('1.0.17');
    assert.ok(await page.evaluate(hash => JSON.parse(localStorage.getItem('khophim_samsung_ota_v1')).rejected.includes(hash), current.manifest.sha256));
    assert.ok((await page.evaluate(() => localStorage.getItem('khophim_tv_watch_history'))).includes('tp--auto-update'));
    pass('Failed trial rolls back to the working runtime and blocks repeated bad release');
    current = release('1.0.19'); corrupt = true;
    await page.evaluate(() => KhoUpdate.check());
    await page.waitForFunction(() => !KhoUpdate.info().checking);
    assert.equal(await page.evaluate(() => KhoUpdate.info().pending), null);
    corrupt = false;
    holdBundle = true;
    await page.evaluate(() => KhoUpdate.check()); await page.waitForFunction(() => !KhoUpdate.info().checking);
    assert.equal(await page.evaluate(() => KhoUpdate.info().pending), null);
    holdBundle = false;
    manifestPatch = { sha256: '0'.repeat(64), bundle: 'bundles/' + '0'.repeat(64) + '.json' };
    await page.evaluate(() => KhoUpdate.check()); await page.waitForFunction(() => !KhoUpdate.info().checking);
    assert.equal(await page.evaluate(() => KhoUpdate.info().pending), null);
    pass('Interrupted/modified bundle and incorrect SHA-256 cannot become pending updates');
    const count = requested.length;
    manifestPatch = { bundle: 'https://untrusted.example/code.json' };
    await page.evaluate(() => KhoUpdate.check()); await page.waitForFunction(() => !KhoUpdate.info().checking);
    assert.equal(requested.length, count + 1);
    assert.equal(await page.evaluate(() => KhoUpdate.info().pending), null);
    current = release('1.0.20', { shell: 2 }); manifestPatch = null;
    await page.evaluate(() => KhoUpdate.check()); await page.waitForFunction(() => !KhoUpdate.info().checking);
    assert.match(await page.evaluate(() => KhoUpdate.info().status), /WGT/);
    pass('External bundle URL and incompatible shell are rejected before execution');
    current = release('1.0.21');
    await page.evaluate(() => {
      window.__originalSet = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) { if (key === 'khophim_samsung_ota_v1') throw new DOMException('Full', 'QuotaExceededError'); return window.__originalSet.call(this, key, value); };
    });
    const savedHistory = await page.evaluate(() => localStorage.getItem('khophim_tv_watch_history'));
    await page.evaluate(() => KhoUpdate.check()); await page.waitForFunction(() => !KhoUpdate.info().checking);
    assert.equal(await page.evaluate(() => KhoUpdate.info().pending), null);
    assert.equal(await page.evaluate(() => localStorage.getItem('khophim_tv_watch_history')), savedHistory);
    assert.equal(await page.evaluate(() => localStorage.getItem('unrelated-data')), 'keep');
    pass('Quota failure keeps working release, history and unrelated storage');
    await page.reload(); await versionIs('1.0.17');
    await page.locator('#menu [data-tab="settings"]').click();
    await page.locator('#update-restore').click();
    await versionIs(baseBundle.version);
    assert.equal(await page.evaluate(() => localStorage.getItem('unrelated-data')), 'keep');
    pass('Settings can restore the bundled release without removing app data');
    await page.evaluate(({ KEY, record }) => localStorage.setItem(KEY, JSON.stringify({ active: record, pending: null, trial: record.sha256, rejected: [] })), { KEY, record: release('1.0.22').record });
    offline = true;
    await page.reload(); await versionIs(baseBundle.version);
    pass('Interrupted prior trial falls back on next launch instead of a crash loop');
    await page.evaluate(KEY => localStorage.setItem(KEY, '{broken'), KEY);
    await page.reload(); await versionIs(baseBundle.version);
    pass('Corrupt update storage recovers to the bundled runtime');
    assert.deepEqual(errors, ['Update boot failure fixture']);
    fs.writeFileSync(path.join(output, 'samsung-auto-update-tests.json'), JSON.stringify({ passed: results.length, tests: results, browser: browser.version(), note: 'Isolated fixture, AVPlay stub; no physical TV/signing validation.' }, null, 2));
    console.log('Total: ' + results.length + ' update integration checks passed');
    await context.close();
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
