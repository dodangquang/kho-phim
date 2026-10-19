/* NODE_PATH must point to Playwright; --live checks the real HLS stream. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const live = process.argv.includes('--live');
const fixture = {
  status: true, movie: { slug: 'tp--fixture-2026', name: 'Phim thử', year: 2026 },
  episodes: ['Vietsub', 'Thuyết Minh'].map((server_name, i) => ({ server_name, server_data: [1, 2].map(n => ({
    slug: 'tap-' + n, name: 'Tập ' + n, link_m3u8: `https://media.test/${i}/${n}.m3u8`, link_embed: 'https://embed.test/player'
  })) }))
};
async function main() {
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    let file = path.resolve(root, '.' + pathname);
    if (file !== root && !file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { response.writeHead(404).end(); return; }
    response.writeHead(200, { 'Content-Type': ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png' })[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(response);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true });
    const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, ...(live ? {} : { userAgent: 'Safari/605.1.15' }) });
    const page = await context.newPage(), errors = [], requests = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', r => requests.push(r.url()));
    await page.route('https://cdn.phimsrv.com/**', route => route.abort());
    await page.route('https://embed.test/**', route => route.fulfill({ contentType: 'text/html', body: '<button>Phát nhúng</button>' }));
    let data = fixture;
    if (live) {
      const listing = await (await fetch('https://khophimqd.vercel.app/source/danh-sach/phim-moi-cap-nhat?page=1', { signal: AbortSignal.timeout(15000) })).json();
      const slug = process.env.KHOPHIM_LIVE_SLUG || (listing.items || listing.data?.items || [])[0]?.slug;
      assert.match(slug || '', /^tp--/);
      data = await (await fetch('https://khophimqd.vercel.app/source/phim/' + slug, { signal: AbortSignal.timeout(15000) })).json();
    }
    await page.route('https://khophimqd.vercel.app/source/**', route => route.fulfill({ json: route.request().url().includes('/phim/') ? data : { status: true, items: [], data: { items: [] } } }));
    if (!live) await page.addInitScript(() => {
      const state = { ready: 0, time: 0, duration: NaN, ranges: [], paused: true, plays: 0 };
      const proto = HTMLMediaElement.prototype;
      Object.defineProperties(proto, {
        readyState: { get: () => state.ready }, duration: { get: () => state.duration },
        currentTime: { get: () => state.time, set: value => { if (!state.ready) throw new Error('metadata'); state.time = value; } },
        paused: { get: () => state.paused }, error: { get: () => null }, ended: { get: () => false }, seeking: { get: () => false },
        seekable: { get: () => ({ length: state.ranges.length, start: i => state.ranges[i][0], end: i => state.ranges[i][1] }) }
      });
      proto.canPlayType = () => 'probably';
      proto.load = function () { state.ready = 0; state.time = 0; state.ranges = []; };
      proto.pause = function () { state.paused = true; this.dispatchEvent(new Event('pause')); };
      proto.play = function () { state.plays++; state.paused = false; this.dispatchEvent(new Event('play')); return Promise.resolve(); };
      window.__native = state;
      state.readyVideo = () => {
        state.ready = 4; state.duration = 1200; state.ranges = [[0, 1200]];
        const video = document.getElementById('tv-video-player');
        ['loadedmetadata', 'progress', 'canplay'].forEach(event => video.dispatchEvent(new Event(event)));
      };
      localStorage.setItem('khophim_desktop_watch_history', JSON.stringify([{ slug: 'tp--fixture-2026', serverName: 'Thuyết Minh', episodeSlug: 'tap-2', episodeName: 'Tập 2', positionMs: 65000 }]));
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/desktop/`);
    await page.waitForFunction(() => !!window.__desktopTest);
    assert.equal(requests.some(url => /hls.*\.js|jsdelivr/.test(url)), false, 'decoder loads only on playback');
    await page.evaluate(slug => window.__desktopTest.openMovieDetail(slug), data.movie.slug);
    if (!live) {
      assert.equal(await page.locator('.tv-server-pill.active').innerText(), 'Thuyết Minh');
      await page.locator('#tv-detail-play-btn').click();
      await page.evaluate(() => window.__native.readyVideo());
      assert.equal(await page.locator('#tv-video-player').evaluate(v => v.currentTime), 65);
      await page.locator('#tv-btn-forward').click();
      assert.equal(await page.locator('#tv-video-player').evaluate(v => v.currentTime), 75);
      await page.locator('#tv-btn-rewind').click();
      assert.equal(await page.locator('#tv-video-player').evaluate(v => v.currentTime), 65);
      await page.locator('#tv-btn-play-pause').click();
      await page.locator('#tv-player-source-toggle-btn').click();
      assert.equal(await page.locator('#tv-player-click-layer').isVisible(), false);
      assert.equal(await page.locator('.player-bottom-bar').isVisible(), false);
      await page.locator('#tv-player-source-toggle-btn').click();
      await page.evaluate(() => window.__native.readyVideo());
      assert.equal(await page.locator('#tv-video-player').evaluate(v => v.currentTime), 65);
      assert.equal(await page.locator('#tv-video-player').evaluate(v => v.paused), true, 'source round trip preserves pause');
      await page.locator('#tv-player-btn-close').click();
      const saved = await page.evaluate(() => window.__desktopTest.getWatchHistory()[0]);
      assert.equal(saved.positionMs, 65000); assert.equal(saved.serverName, 'Thuyết Minh');
      await page.locator('.tv-ep-btn').first().click();
      await page.evaluate(() => window.__native.readyVideo());
      assert.equal(await page.locator('#tv-video-player').evaluate(v => v.currentTime), 0, 'new episode resets timing');
      await page.locator('#tv-player-btn-close').click();
      await page.evaluate(async () => { await window.__desktopTest.openMovieDetail('tp--fixture-2026', true); window.__desktopTest.closeMovieDetail(); });
      await page.waitForTimeout(300);
      assert.equal(await page.locator('#tv-player-overlay').evaluate(el => el.classList.contains('open')), false, 'closing detail cancels deferred playback');
      assert.equal(requests.some(url => /jsdelivr|ophim1\.com/.test(url)), false);
      console.log('PASS desktop: saved language/episode, ±10, paused source round trip, iframe controls, history, next episode and cancelled autoplay');
    } else {
      const start = Date.now();
      await page.locator('#tv-detail-play-btn').click();
      await page.waitForFunction(() => { const v = document.getElementById('tv-video-player'); return !v.paused && v.readyState >= 2 && v.currentTime > 1; }, null, { timeout: 45000 });
      const startupMs = Date.now() - start;
      await page.locator('#tv-player-overlay').hover();
      await page.locator('#tv-btn-forward').click();
      await page.waitForFunction(() => { const v = document.getElementById('tv-video-player'); return v.currentTime > 10 && !v.seeking && v.readyState >= 2; }, null, { timeout: 30000 });
      await page.locator('#tv-btn-play-pause').click();
      const before = await page.locator('#tv-video-player').evaluate(v => v.currentTime);
      await page.locator('#tv-player-source-toggle-btn').click();
      await page.locator('#tv-player-source-toggle-btn').click();
      await page.waitForFunction(pos => { const v = document.getElementById('tv-video-player'); return Math.abs(v.currentTime - pos) < 0.5 && v.paused && v.readyState >= 2; }, before, { timeout: 45000 });
      await page.screenshot({ path: path.join(process.env.KHOPHIM_TEST_OUTPUT || path.resolve(root, '../../'), 'desktop-playback.png') });
      console.log(JSON.stringify({ pass: data.movie.slug, startupMs, restoredPausedAt: before, decoder: requests.find(url => /hls.*\.js/.test(url)) }));
      await page.evaluate(() => window.__desktopTest.closeVideoPlayer());
    }
    assert.deepEqual(errors, []);
    await context.close();
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
