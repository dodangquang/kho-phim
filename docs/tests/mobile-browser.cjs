/* Run with NODE_PATH pointing to Playwright. Add --live to check the public CDN. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
const live = process.argv.includes('--live');

async function main() {
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    let file = path.resolve(root, '.' + pathname);
    if (file !== root && !file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { response.writeHead(404).end(); return; }
    response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(response);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
      ...(live ? {} : { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1' }) });
    const page = await context.newPage();
    const errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => requests.push(request.url()));
    // Keep the test focused on playback; shelves and posters are unrelated traffic.
    await page.route('https://phimapi.com/**', route => route.fulfill({ json: { status: true, items: [], data: { items: [], params: { pagination: { totalPages: 1 } } } } }));
    await page.route('https://phimimg.com/**', route => route.abort());
    if (!live) {
      await page.addInitScript(() => {
        const state = { ready: 0, time: 0, duration: NaN, ranges: [], paused: true, loads: 0 };
        const proto = HTMLMediaElement.prototype;
        Object.defineProperties(proto, {
          readyState: { get: () => state.ready }, duration: { get: () => state.duration },
          currentTime: { get: () => state.time, set: value => { if (!state.ready) throw new Error('metadata'); state.time = value; } },
          paused: { get: () => state.paused },
          error: { get: () => null }, ended: { get: () => false }, seeking: { get: () => false },
          seekable: { get: () => ({ length: state.ranges.length, start: i => state.ranges[i][0], end: i => state.ranges[i][1] }) }
        });
        proto.canPlayType = () => 'probably';
        proto.load = function () { state.ready = 0; state.time = 0; state.ranges = []; state.loads++; };
        proto.pause = function () { state.paused = true; };
        proto.play = function () { state.paused = false; return Promise.resolve(); };
        window.__native = state;
        state.readyVideo = (duration, ranges = [[0, duration]]) => {
          state.ready = 4; state.duration = duration; state.ranges = ranges;
          const video = document.getElementById('video-player');
          ['loadedmetadata', 'progress', 'canplay', 'playing'].forEach(event => video.dispatchEvent(new Event(event)));
        };
      });
    }
    const url = `http://127.0.0.1:${server.address().port}/?mode=mobile`;
    await page.goto(url);
    await page.waitForFunction(() => !!window.__testHelpers);
    assert.equal(requests.some(url => /hls.*\.js|jsdelivr/.test(url)), false, 'Browsing must not load HLS.js');
    if (!live) {
      await page.evaluate(() => {
        const movie = { slug: 'test-movie', name: 'Phim thử' };
        const episodes = [{ slug: 'tap-1', name: 'Tập 1', link_m3u8: 'https://example.test/one.m3u8', link_embed: 'https://embed.example.test/player' }, { slug: 'tap-2', name: 'Tập 2', link_m3u8: 'https://example.test/two.m3u8' }];
        window.__testHelpers.startVideoPlayback(movie, episodes[0], episodes, 'Vietsub', 35);
        window.__native.readyVideo(120);
        window.__homeChanges = 0;
        new MutationObserver(() => window.__homeChanges++).observe(document.getElementById('continue-watching-section'), { childList: true, subtree: true });
      });
      assert.equal(await page.locator('#video-player').evaluate(video => video.currentTime), 35);
      await page.screenshot({ path: path.join(process.env.KHOPHIM_TEST_OUTPUT || path.resolve(root, '../../'), 'mobile-player.png') });
      await page.getByRole('button', { name: 'Tiến 10 giây' }).click();
      assert.equal(await page.locator('#video-player').evaluate(video => video.currentTime), 45);
      await page.getByRole('button', { name: 'Lùi 10 giây' }).click();
      assert.equal(await page.locator('#video-player').evaluate(video => video.currentTime), 35);
      await page.evaluate(() => {
        const video = document.getElementById('video-player');
        window.__native.time = 61; video.dispatchEvent(new Event('timeupdate'));
        video.dispatchEvent(new Event('webkitendfullscreen'));
      });
      assert.equal(await page.locator('#player-overlay').evaluate(element => element.classList.contains('open')), true);
      assert.equal(await page.evaluate(() => window.__homeChanges), 0, 'Saving playback must not rebuild home cards');
      assert.equal(await page.evaluate(() => window.__testHelpers.getWatchHistory()[0].currentTime), 61);
      await page.evaluate(() => window.togglePlayerSource());
      assert.equal(await page.locator('#player-seek-controls').isVisible(), false);
      await page.evaluate(() => { window.togglePlayerSource(); window.__native.readyVideo(120); });
      assert.equal(await page.locator('#video-player').evaluate(video => video.currentTime), 61, 'Returning from embed resumes the direct-stream position');
      await page.evaluate(() => { window.__native.paused = true; });
      await page.getByRole('button', { name: 'Tiến 10 giây' }).click();
      assert.equal(await page.locator('#video-player').evaluate(video => video.paused), true, 'Seeking preserves pause');
      await page.evaluate(() => window.playNextEpisode());
      await page.evaluate(() => window.__native.readyVideo(120));
      assert.equal(await page.locator('#video-player').evaluate(video => video.currentTime), 0, 'Next episode starts independently');
      await page.evaluate(() => window.closeVideoPlayer(true));
      assert.equal(await page.locator('#video-player').evaluate(video => video.hasAttribute('src')), false);
      assert.equal(await page.locator('#player-overlay').evaluate(element => element.classList.contains('open')), false);
      assert.equal(requests.some(url => /hls.*\.js|jsdelivr/.test(url)), false);
      console.log('PASS mobile UI: Safari lifecycle, ±10s buttons, fullscreen exit, history without home rerenders, next episode and cleanup');
    } else {
      for (const [slug, resume] of [['truyen-kinh-di-my-phan-13', 0], ['chim-vao-mat-em-phan-1', 180], ['yeu-mot-nguoi-khac-yeu-mot-nguoi-khac-khong-phai-em', 60]]) {
        const data = await (await fetch('https://phimapi.com/phim/' + slug, { signal: AbortSignal.timeout(15000) })).json();
        const episodes = data.episodes[0].server_data;
        const start = Date.now();
        await page.evaluate(({ movie, episodes, name, resume }) => window.__testHelpers.startVideoPlayback(movie, episodes[0], episodes, name, resume), { movie: data.movie, episodes, name: data.episodes[0].server_name, resume });
        await page.waitForFunction(resume => { const v = document.getElementById('video-player'); return v.currentTime > resume + 1 && !v.paused && v.readyState >= 2; }, resume, { timeout: 45000 });
        const startupMs = Date.now() - start;
        const before = await page.locator('#video-player').evaluate(video => video.currentTime);
        await page.getByRole('button', { name: 'Tiến 10 giây' }).click();
        await page.waitForFunction(target => { const v = document.getElementById('video-player'); return v.currentTime >= target && !v.seeking && v.readyState >= 2; }, before + 9, { timeout: 30000 });
        const forward = await page.locator('#video-player').evaluate(video => video.currentTime);
        await page.getByRole('button', { name: 'Lùi 10 giây' }).click();
        await page.waitForFunction(target => { const v = document.getElementById('video-player'); return v.currentTime < target - 5 && !v.seeking && v.readyState >= 2; }, forward, { timeout: 30000 });
        const backward = await page.locator('#video-player').evaluate(video => video.currentTime);
        await page.waitForFunction(target => document.getElementById('video-player').currentTime > target + 0.5, backward, { timeout: 15000 });
        await page.evaluate(() => window.seekVideoBy(180));
        await page.waitForFunction(target => { const v = document.getElementById('video-player'); return v.currentTime > target + 179 && !v.seeking && v.readyState >= 2; }, backward, { timeout: 30000 });
        const info = await page.locator('#video-player').evaluate(video => ({ time: video.currentTime, duration: video.duration, muted: video.muted, error: video.error?.message }));
        assert.equal(info.muted, false); assert.equal(info.error, undefined);
        console.log(JSON.stringify({ pass: slug, startupMs, forward, ...info }));
        await page.evaluate(() => window.closeVideoPlayer(true));
      }
    }
    assert.deepEqual(errors, [], 'No uncaught browser exceptions');
    await page.screenshot({ path: path.join(process.env.KHOPHIM_TEST_OUTPUT || path.resolve(root, '../../'), 'mobile-browser.png'), fullPage: true });
    await context.close();
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
