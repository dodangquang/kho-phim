'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium, webkit } = require('playwright');
const root = path.resolve(__dirname, '..');
async function main() {
  const server = http.createServer((req, res) => {
    let file = path.resolve(root, '.' + new URL(req.url, 'http://local').pathname);
    if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', ({ '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png' })[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = process.argv.includes('--webkit') ? await webkit.launch({ headless: true }) : await chromium.launch({ headless: true, channel: 'msedge' });
    for (const surface of ['mobile', 'desktop', 'tv']) {
      const mobile = surface === 'mobile';
      const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1920, height: 1080 }, isMobile: mobile, hasTouch: mobile });
      await context.addInitScript(() => {
        window.__detailCaches = [];
        const original = window.fetch;
        window.fetch = function (url, options) {
          if (String(url).includes('/source/phim/')) window.__detailCaches.push(options && options.cache);
          return original.apply(this, arguments);
        };
        localStorage.setItem('unrelated-data', 'keep');
      });
      const movie = { slug: 'tp--refresh-fixture', name: 'Phim kiểm tra tập mới', year: 2026, lang: 'Vietsub', quality: 'HD' };
      let count = 4, fail = false, gate = null, detailRequests = 0;
      await context.route('https://khophimqd.vercel.app/source/**', async route => {
        if (route.request().url().includes('/source/phim/')) {
          detailRequests++;
          if (gate) await gate;
          if (fail) return route.fulfill({ status: 503, json: { status: false } }).catch(() => {});
          return route.fulfill({ json: { status: true, movie, episodes: ['Diamond [VS]', 'Gold [VS]'].map(server_name => ({ server_name, server_data: Array.from({ length: count }, (_, index) => ({ name: 'Tập ' + (index + 1), slug: 'tap-' + (index + 1), link_m3u8: 'https://media.example/ep.m3u8' })) })) }, headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' } }).catch(() => {});
        }
        return route.fulfill({ json: { status: true, items: [movie], data: { items: [movie], params: { pagination: { totalItems: 1, totalPages: 1, totalItemsPerPage: 6 } } } } });
      });
      const page = await context.newPage();
    await page.route('**/announcement.json', route => route.fulfill({ json: { active: false }, headers: { 'Access-Control-Allow-Origin': '*' } }));
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('http://127.0.0.1:' + server.address().port + (mobile ? '/?mode=mobile' : '/' + surface + '/'));
      await page.locator(mobile ? '.movie-card' : '.tv-card').first().click();
      const episodes = page.locator(mobile ? '.episode-btn' : surface === 'desktop' ? '#tv-episode-grid .tv-ep-btn' : '#episodes button');
      await episodes.nth(3).waitFor();
      assert.equal(await episodes.count(), 4);
      const servers = page.locator(mobile ? '.server-btn' : surface === 'desktop' ? '#tv-server-tabs .tv-server-pill' : '#servers button');
      await servers.filter({ hasText: 'Gold [VS]' }).click();
      const refresh = page.locator(mobile ? '#refresh-episodes' : surface === 'desktop' ? '#tv-refresh-episodes' : '#detail-refresh');
      count = 5;
      await refresh.click();
      await episodes.nth(4).waitFor();
      assert.equal(await episodes.count(), 5);
      assert.equal(await servers.filter({ hasText: 'Gold [VS]' }).evaluate(node => node.classList.contains('active')), true);
      if (surface !== 'tv') assert.deepEqual(await page.evaluate(() => window.__detailCaches), ['no-store', 'no-store']);
      fail = true;
      await refresh.click();
      await page.locator(mobile ? '#episode-refresh-status' : surface === 'desktop' ? '#tv-episode-refresh-status' : '#detail-status').filter({ hasText: 'Chưa tải được tập mới' }).waitFor();
      assert.equal(await episodes.count(), 5, 'Network failure preserves visible episodes');
      assert.equal(await page.evaluate(() => localStorage.getItem('unrelated-data')), 'keep');
      fail = false;
      const before = detailRequests;
      let release;
      gate = new Promise(resolve => { release = resolve; });
      await refresh.click();
      await page.waitForFunction(id => document.querySelector(id).disabled, mobile ? '#refresh-episodes' : surface === 'desktop' ? '#tv-refresh-episodes' : '#detail-refresh');
      await page.locator(mobile ? '.detail-close-btn' : surface === 'desktop' ? '#tv-detail-close-btn' : '#detail-back').click();
      release(); gate = null;
      await page.waitForTimeout(100);
      assert.equal(await page.locator(mobile ? '#detail-modal' : surface === 'desktop' ? '#tv-detail-modal' : '#detail').isVisible(), false, 'Late refresh cannot reopen a closed detail');
      assert.ok(detailRequests >= before);
      assert.deepEqual(errors, []);
      console.log('PASS ' + surface + ': 4→5 episode refresh, selected server, no-store, failure recovery, close race');
      await context.close();
    }
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
