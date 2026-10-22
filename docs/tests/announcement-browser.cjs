/* Isolated startup notices, including the real Samsung OTA shell and its CSP. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium, webkit } = require('playwright');
const { build } = require('../../tv-samsung-tizen/tools/build-update.cjs');
const root = path.resolve(__dirname, '../..');
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'docs/announcement.json'), 'utf8'));
const bundle = build();
const csp = /<tizen:content-security-policy>([^<]+)/.exec(fs.readFileSync(path.join(root, 'tv-samsung-tizen/config.xml'), 'utf8'))[1];
async function main() {
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://local').pathname;
    if (pathname.includes('$WEBAPIS')) { res.setHeader('Content-Type', 'application/javascript'); res.end('/* supplied by TV */'); return; }
    let file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404).end(); return; }
    if (pathname.startsWith('/tv-samsung-tizen/')) res.setHeader('Content-Security-Policy', csp);
    res.setHeader('Content-Type', ({ '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' })[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    const safari = process.argv.includes('--webkit');
    browser = safari ? await webkit.launch({ headless: true }) : await chromium.launch({ channel: 'msedge', headless: true });
    for (const surface of safari ? ['mobile', 'desktop', 'tv'] : ['mobile', 'desktop', 'tv', 'samsung']) {
      const context = await browser.newContext({ viewport: surface === 'mobile' ? { width: 390, height: 844 } : { width: 1366, height: 900 } });
      let notice = fixture, offline = false, hold = false, release;
      const errors = [];
      await context.addInitScript(() => {
        window.tizen = { tvinputdevice: { registerKey() {} } };
        window.webapis = { avplay: { open() {}, close() {}, stop() {} } };
      });
      await context.route('**/announcement.json', async route => {
        if (hold) await new Promise(resolve => { release = resolve; });
        if (offline) return route.abort();
        await route.fulfill({ json: notice, headers: { 'Access-Control-Allow-Origin': '*' } });
      });
      await context.route('https://khophimqd.vercel.app/source/**', route => route.fulfill({ json: { status: true, items: [], data: { items: [], params: { pagination: { totalItems: 0 } } } }, headers: { 'Access-Control-Allow-Origin': '*' } }));
      await context.route('https://khophimqd.vercel.app/samsung/**', route => route.fulfill({ body: new URL(route.request().url()).pathname.endsWith('/update.json') ? JSON.stringify(bundle.manifest) : bundle.text, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' } }));
      const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
      async function reload() {
        // Closing a Samsung trial before the shell's health check intentionally rolls it back.
        if (surface === 'samsung') await page.waitForFunction(() => window.KhoBoot && KhoBoot.ready && !JSON.parse(localStorage.getItem('khophim_samsung_ota_v1')).trial);
        await page.reload();
        if (surface === 'samsung') await page.waitForFunction(() => window.KhoBoot && KhoBoot.ready && !JSON.parse(localStorage.getItem('khophim_samsung_ota_v1')).trial);
      }
      const url = 'http://127.0.0.1:' + server.address().port + ({ mobile: '/docs/', desktop: '/docs/desktop/', tv: '/docs/tv/', samsung: '/tv-samsung-tizen/' })[surface];
      await page.goto(url);
      if (surface === 'samsung') {
        await page.waitForFunction(v => window.KhoUpdate && KhoUpdate.info().pending === v, bundle.manifest.version).catch(async error => {
          console.error({ errors, state: await page.evaluate(() => ({ url: location.href, info: window.KhoUpdate && KhoUpdate.info(), ready: window.KhoBoot && KhoBoot.ready })) }); throw error;
        });
        await reload();
      }
      const dialog = page.locator('#khophim-announcement');
      await dialog.waitFor({ state: 'visible' });
      assert.equal(await dialog.locator('p').textContent(), fixture.message);
      assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Đã hiểu');
      await page.evaluate(() => document.querySelector('button:not(.kho-notice-close)').focus());
      assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Đã hiểu', 'background renders must not steal dialog focus');
      const unrelated = await page.evaluate(() => { localStorage.setItem('notice-history-sentinel', 'keep'); return localStorage.getItem('notice-history-sentinel'); });
      if (surface === 'tv' || surface === 'samsung') {
        await page.evaluate(() => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 10009, bubbles: true })));
      } else await dialog.getByRole('button', { name: 'Đã hiểu' }).click();
      await dialog.waitFor({ state: 'detached' });
      await reload(); await page.waitForTimeout(300);
      assert.equal(await dialog.count(), 0);
      assert.equal(await page.evaluate(() => localStorage.getItem('notice-history-sentinel')), unrelated);
      notice = { ...fixture, id: 'next-notice', title: '<img src=x onerror=alert(1)>', message: '<script>window.__unsafe=true</script>' };
      await reload(); await dialog.waitFor({ state: 'visible' });
      assert.equal(await dialog.locator('h2').textContent(), notice.title);
      assert.equal(await dialog.locator('img, script').count(), 0);
      await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' });
      notice = { ...fixture, id: '../invalid' };
      await reload(); await page.waitForTimeout(300); assert.equal(await dialog.count(), 0);
      offline = true;
      await reload(); await page.waitForTimeout(300); assert.equal(await dialog.count(), 0);
      assert.ok(await page.locator('body').isVisible());
      offline = false; hold = true; notice = { ...fixture, id: 'deferred-notice' };
      await reload();
      await page.waitForFunction(() => document.querySelector('#player, #player-overlay, #tv-player-overlay'));
      await page.evaluate(() => {
        const player = document.querySelector('#player, #player-overlay, #tv-player-overlay');
        player.classList.add('open'); player.classList.remove('hidden');
      });
      await page.waitForFunction(() => document.readyState === 'complete');
      assert.equal(typeof release, 'function'); hold = false; release();
      await page.waitForTimeout(300); assert.equal(await dialog.count(), 0, 'notice must wait while player is open');
      await page.evaluate(() => {
        const player = document.querySelector('#player, #player-overlay, #tv-player-overlay');
        player.classList.remove('open'); player.classList.add('hidden');
      });
      await dialog.waitFor({ state: 'visible' });
      await dialog.getByRole('button', { name: 'Đã hiểu' }).click();
      assert.deepEqual(errors, []);
      console.log('PASS ' + surface + ': startup, acknowledgment, reload, new ID, text escaping, invalid/offline feed, playback deferral');
      await context.close();
    }
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
