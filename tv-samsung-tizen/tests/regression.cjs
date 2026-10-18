/* Development only. Run npm install && npm test, with Edge installed.
   Set BROWSER_CHANNEL=chrome or ACORN_PATH for an existing local test runtime. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const acorn = require(process.env.ACORN_PATH || 'acorn');
const root = path.resolve(__dirname, '..');
const artifacts = path.resolve(process.env.TEST_ARTIFACT_DIR || path.join(root, '.test-results'));
fs.mkdirSync(artifacts, { recursive: true });
const results = [];
function pass(name) { results.push(name); console.log('PASS ' + name); }
function movie(index) {
  return { slug: 'phim-' + index, name: 'Phim thử nghiệm ' + index, year: 2026, quality: 'HD', lang: 'Vietsub', poster_url: 'https://posters.example/film-' + index + '.png' };
}
function mockPlatform() {
  const state = { name: 'NONE', calls: [], listener: null, pending: [], manual: false, duration: 3600000 };
  window.__av = state;
  function record(name, args, valid) {
    if (valid && valid.indexOf(state.name) === -1) throw new Error(name + ' invalid state ' + state.name);
    state.calls.push([name].concat(Array.prototype.slice.call(args)));
  }
  window.webapis = {
    appcommon: { setScreenSaver: function (value) { state.calls.push(['screensaver', value]); } },
    avplay: {
      open: function (url) { record('open', arguments, ['NONE', 'IDLE']); state.name = 'IDLE'; state.url = url; },
      stop: function () { record('stop', arguments); state.name = 'IDLE'; },
      close: function () { record('close', arguments); state.name = 'NONE'; },
      setDisplayRect: function () { record('setDisplayRect', arguments, ['IDLE', 'READY', 'PLAYING', 'PAUSED']); },
      setDisplayMethod: function () { record('setDisplayMethod', arguments, ['READY', 'PLAYING', 'PAUSED']); },
      setListener: function (listener) { record('setListener', [], ['IDLE']); state.listener = listener; },
      getDuration: function () { record('getDuration', [], ['READY', 'PLAYING', 'PAUSED']); return state.duration; },
      prepareAsync: function (success, failure) {
        record('prepareAsync', [], ['IDLE', 'READY']);
        state.pending.push({ success: success, failure: failure });
        if (!state.manual) setTimeout(function () { state.name = 'READY'; success(); }, 10);
      },
      play: function () { record('play', [], ['READY', 'PLAYING', 'PAUSED']); state.name = 'PLAYING'; },
      pause: function () { record('pause', [], ['PLAYING', 'PAUSED']); state.name = 'PAUSED'; },
      seekTo: function (ms, success) { record('seekTo', [ms], ['READY', 'PLAYING', 'PAUSED']); setTimeout(success, 5); }
    }
  };
  window.tizen = { tvinputdevice: { registerKey: function () {} }, application: { getCurrentApplication: function () { return { exit: function () { window.__exited = true; } }; } } };
}

(async function () {
  let browser;
  const server = http.createServer((req, res) => {
    const requested = decodeURIComponent(new URL(req.url, 'http://local').pathname);
    if (requested.indexOf('$WEBAPIS') !== -1) { res.setHeader('Content-Type', 'application/javascript'); res.end('/* provided by TV, mocked for tests */'); return; }
    const file = path.resolve(root, '.' + (requested === '/' ? '/index.html' : requested));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png' };
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    const csp = /<tizen:content-security-policy>([^<]+)</.exec(fs.readFileSync(path.join(root, 'config.xml'), 'utf8'));
    res.setHeader('Content-Security-Policy', csp[1]);
    fs.createReadStream(file).pipe(res);
  });
  try {
    for (const file of ['boot.js', 'core.js', 'player.js', 'posters.js', 'home.js', 'app.js']) {
      acorn.parse(fs.readFileSync(path.join(root, file), 'utf8'), { ecmaVersion: 5 });
    }
    pass('All runtime JavaScript parses as ES5');
    require('./pagination.cjs')();
    pass('Six-film pagination preserves every item for 6, 12 and 24-item source pages');
    require('./poster-input.cjs')().forEach(pass);
    require('./player-timing.cjs')();
    pass('Watchdog refreshes on progress, clears on pause, rearms on resume and closes stalled video');
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = 'http://127.0.0.1:' + server.address().port;
    browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'msedge' });
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, userAgent: 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 5.5) AppleWebKit/537.36 Chrome/69.0.3497.106 TV Safari/537.36' });
    await context.addInitScript(mockPlatform);
    const mode = { offline: false, failDetail: false };
    const apiRequests = [];
    const posterRequests = [];
    let releaseInitialPosters;
    const initialPosterGate = new Promise(resolve => { releaseInitialPosters = resolve; });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin === base) { await route.continue(); return; }
      if (url.hostname !== 'phimapi.com' && url.hostname !== 'ophim1.com') {
        if (url.hostname === 'posters.example') { posterRequests.push(url.href); await initialPosterGate; }
        await route.fulfill({ status: 200, contentType: 'image/png', headers: { 'cache-control': 'no-store' }, body: fs.readFileSync(path.join(root, 'icon.png')) }); return;
      }
      apiRequests.push(url.href);
      if (mode.offline || (mode.failDetail && url.pathname.indexOf('/phim/') === 0)) { await route.abort(); return; }
      let json;
      if (url.pathname.indexOf('/phim/') === 0) {
        json = { status: true, movie: { ...movie(Number(url.pathname.split('-').pop()) || 0), content: '<b>Mô tả phim thử nghiệm để kiểm tra giao diện TV và danh sách tập.</b>', category: [{ name: 'Hành động' }] }, episodes: [
          { server_name: 'Vietsub', server_data: Array.from({ length: 500 }, (_, index) => ({ name: 'Tập ' + (index + 1), slug: 'tap-' + (index + 1), link_m3u8: 'https://media.example/episode-' + index + '.m3u8' })) },
          { server_name: 'Lồng tiếng', server_data: [{ name: 'Tập 1', slug: 'tap-1', link_m3u8: 'https://media.example/dub.m3u8' }] }
        ] };
      } else {
        const isHome = url.pathname.endsWith('/phim-moi');
        const size = isHome ? 24 : Number(url.searchParams.get('limit')) || 6;
        const page = Number(url.searchParams.get('page')) || 1;
        const keyword = url.searchParams.get('keyword');
        if (keyword === 'old') await new Promise(resolve => setTimeout(resolve, 220));
        const items = Array.from({ length: size }, (_, index) => movie((page - 1) * size + index));
        if (keyword) items.forEach(item => { item.name = keyword + ' ' + item.name; });
        json = { status: 'success', data: { items, APP_DOMAIN_CDN_IMAGE: 'https://phimimg.com', params: { pagination: { totalItems: 120, totalItemsPerPage: size, currentPage: page, totalPages: 120 / size } } } };
      }
      await route.fulfill({ json, headers: { 'access-control-allow-origin': '*' } }).catch(() => {});
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    await page.waitForFunction(() => window.KhoBoot.ready && !document.querySelector('#hero-play').disabled && document.querySelectorAll('#shelves .tv-card').length >= 6);
    assert.equal(await page.locator('#menu button').count(), 7);
    assert.equal(await page.locator('script[src^="https:"]').count(), 0);
    assert.equal(await page.locator('iframe').count(), 0);
    assert.equal(await page.locator('#hero').evaluate(node => node.offsetHeight), 480);
    assert.equal(await page.locator('#sidebar').evaluate(node => node.offsetWidth), 68);
    assert.equal(await page.locator('#shelves > .tv-shelf-section').count(), 11);
    await page.waitForTimeout(100);
    assert.ok(apiRequests.length <= 2, 'Only nearby shelves may request initial data');
    assert.ok(await page.locator('#shelves .tv-card').count() <= 18);
    assert.ok(await page.locator('[data-shelf="0"] canvas').evaluateAll(canvases => canvases.length === 6 && canvases.every(canvas => canvas.width === 0 && canvas.parentNode.clientHeight === 346 && canvas.parentNode.clientWidth === canvas.closest('.tv-card').clientWidth)));
    releaseInitialPosters();
    pass('Poster frames retain full height while network images are still loading and no card is focused');
    await page.screenshot({ path: path.join(artifacts, 'home.png') });
    assert.equal(await page.locator('[data-shelf="0"] .tv-card').count(), 6);
    await page.locator('[data-shelf="0"] .tv-card').first().evaluate(node => node.focus());
    assert.equal(await page.locator('[data-shelf="0"] .tv-card').first().evaluate(node => getComputedStyle(node).transform), 'none');
    assert.ok(await page.locator('[data-shelf="0"] .tv-card-title').first().evaluate(node => node.getBoundingClientRect().height >= 19));
    await page.locator('#hero-play').evaluate(node => node.focus());
    pass('Original banner/menu retained with six larger films and no focus zoom/glow');
    pass('Initial home loads only nearby shelves; no remote script or iframe');
    await page.waitForFunction(() => document.querySelectorAll('#shelves canvas[data-painted="true"]').length >= 6);
    assert.equal(await page.locator('#shelves .tv-card img').count(), 0);
    assert.ok(await page.locator('#shelves canvas[data-painted="true"]').evaluateAll(canvases => canvases.every(canvas => canvas.width <= 320 && Math.abs(canvas.width / canvas.height - canvas.parentNode.clientWidth / canvas.parentNode.clientHeight) < 0.005 && canvas.parentNode.clientHeight === 346 && canvas.parentNode.clientWidth === canvas.closest('.tv-card').clientWidth)));
    pass('Poster canvases fit their fixed 346px frames with matching aspect ratio before focus');
    const dimensionsBefore = await page.locator('[data-shelf="0"] .tv-card-poster-wrap').first().evaluate(node => [node.clientWidth, node.clientHeight]);
    await page.locator('[data-shelf="0"] .tv-card').first().evaluate(node => node.focus());
    assert.deepEqual(await page.locator('[data-shelf="0"] .tv-card-poster-wrap').first().evaluate(node => [node.clientWidth, node.clientHeight]), dimensionsBefore);
    await page.locator('#hero-play').evaluate(node => node.focus());
    pass('Unfocused and focused cards keep identical poster frame dimensions');
    assert.ok(await page.locator('#shelves .tv-card').evaluateAll(cards => cards.every(card => card.getAttribute('role') === 'button' && card.tabIndex === 0)));
    await page.locator('[data-shelf="0"] .tv-card').nth(5).evaluate(node => node.focus());
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelectorAll('#episodes button').length === 24);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('[data-shelf="0"] .tv-card').nth(5).evaluate(node => document.activeElement === node), true);
    await page.keyboard.press('Space');
    await page.waitForFunction(() => document.querySelectorAll('#episodes button').length === 24);
    await page.keyboard.press('Escape');
    await page.locator('#hero-play').evaluate(node => node.focus());
    pass('Movie cards retain focus, Enter/Space activation and Return after replacing native buttons');
    for (let i = 0; i < 11; i++) {
      await page.keyboard.press('ArrowDown');
      await page.waitForFunction(index => {
        const shelf = document.activeElement.closest('[data-shelf]');
        return shelf && Number(shelf.getAttribute('data-shelf')) === index;
      }, i);
      await page.waitForTimeout(100);
      assert.ok(await page.locator('#shelves .tv-card').count() <= 18);
    }
    await page.locator('#menu [data-tab="home"]').click();
    await page.waitForFunction(() => document.querySelectorAll('[data-shelf="0"] .tv-card').length === 6);
    pass('Remote traverses all eleven virtual shelves without losing focus or growing DOM');
    const firstShelf = page.locator('[data-shelf="0"]');
    await firstShelf.locator('.tv-card-more').last().click();
    await page.waitForFunction(() => document.querySelector('[data-shelf="0"] .tv-card-title') && document.querySelector('[data-shelf="0"] .tv-card-title').textContent === 'Phim thử nghiệm 6');
    assert.equal(await firstShelf.locator('.tv-card').count(), 6);
    await firstShelf.locator('.tv-card-more').first().click();
    await page.waitForFunction(() => document.querySelector('[data-shelf="0"] .tv-card-title').textContent === 'Phim thử nghiệm 0');
    pass('Horizontal shelf Next/Previous replaces a six-film window without accumulating cards');
    await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-shelf="0"] canvas')).every(canvas => canvas._painted));
    const loadedFirstPosters = posterRequests.filter(url => /\/film-[0-5]\.png$/.test(url)).length;
    await page.evaluate(() => { const main = document.querySelector('#main'); main.scrollTop = document.querySelector('[data-shelf="8"]').offsetTop + 10; });
    await page.waitForFunction(() => document.querySelectorAll('[data-shelf="8"] .tv-card').length === 6);
    assert.equal(await firstShelf.locator('.tv-card').count(), 0);
    assert.equal(await firstShelf.evaluate(node => node.offsetHeight), 540);
    assert.ok(await page.locator('#shelves .tv-card').count() <= 18);
    await page.evaluate(() => { document.querySelector('#main').scrollTop = 0; });
    await page.waitForFunction(() => document.querySelectorAll('[data-shelf="0"] .tv-card').length === 6);
    await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-shelf="0"] canvas')).every(canvas => canvas._painted));
    assert.equal(posterRequests.filter(url => /\/film-[0-5]\.png$/.test(url)).length, loadedFirstPosters);
    pass('Distant shelves restore all six posters without focus or refetch, with HTTP image cache disabled');
    await page.locator('[data-shelf="3"]').evaluate(node => { document.querySelector('#main').scrollTop = node.offsetTop - 50; });
    await page.waitForFunction(() => document.querySelectorAll('[data-shelf="3"] .tv-card').length === 6);
    for (const expectedStart of [6, 12, 18, 24]) {
      await page.locator('[data-shelf="3"] .tv-card-more').last().click();
      await page.waitForFunction(expected => {
        const title = document.querySelector('[data-shelf="3"] .tv-card-title');
        return title && title.textContent === 'Phim thử nghiệm ' + expected;
      }, expectedStart);
      assert.equal(await page.locator('[data-shelf="3"] .tv-card').count(), 6);
    }
    assert.ok(apiRequests.some(url => url.includes('/phim-moi?page=1&limit=6')));
    assert.ok(apiRequests.some(url => url.includes('/phim-moi?page=2&limit=6')));
    pass('Six-film home windows traverse all four parts of fixed 24-film API pages');
    await page.locator('#menu [data-tab="single"]').click();
    await page.waitForFunction(() => document.querySelectorAll('#grid .tv-card').length === 6);
    await page.waitForFunction(() => Array.from(document.querySelectorAll('#grid canvas')).every(canvas => canvas._painted));
    assert.ok(await page.locator('#grid canvas').evaluateAll(canvases => canvases.every(canvas => Math.abs(canvas.width / canvas.height - canvas.parentNode.clientWidth / canvas.parentNode.clientHeight) < 0.005)));
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => !document.querySelector('#sidebar').classList.contains('expanded') && Array.from(document.querySelectorAll('#grid canvas')).every(canvas => canvas._displayWidth === canvas.parentNode.clientWidth));
    assert.ok(await page.locator('#grid canvas').evaluateAll(canvases => canvases.every(canvas => Math.abs(canvas.width / canvas.height - canvas.parentNode.clientWidth / canvas.parentNode.clientHeight) < 0.005)));
    pass('Opening and closing sidebar redraws every category poster to the new width without focus stretch');
    const firstCategoryLoads = posterRequests.filter(url => /\/film-[0-5]\.png$/.test(url)).length;
    await page.locator('#next').click();
    await page.waitForFunction(() => document.querySelector('#grid .tv-card-title') && document.querySelector('#grid .tv-card-title').textContent === 'Phim thử nghiệm 6');
    await page.locator('#previous').click();
    await page.waitForFunction(() => document.querySelector('#grid .tv-card-title').textContent === 'Phim thử nghiệm 0' && Array.from(document.querySelectorAll('#grid canvas')).every(canvas => canvas._painted));
    assert.equal(posterRequests.filter(url => /\/film-[0-5]\.png$/.test(url)).length, firstCategoryLoads);
    pass('Returning to a category page restores six cached posters without downloading again');
    await page.locator('#next').click();
    await page.waitForFunction(() => document.querySelector('#grid .tv-card-title').textContent === 'Phim thử nghiệm 6');
    await page.locator('#next').click();
    await page.waitForFunction(() => document.querySelector('#grid .tv-card-title') && document.querySelector('#grid .tv-card-title').textContent === 'Phim thử nghiệm 12');
    assert.equal(await page.locator('#grid .tv-card').count(), 6);
    await page.screenshot({ path: path.join(artifacts, 'catalog.png') });
    pass('Category pagination uses original poster style and retains only six films');
    await page.locator('#grid .tv-card').first().click();
    await page.waitForFunction(() => document.querySelectorAll('#episodes button').length === 24);
    assert.match(await page.locator('#episode-heading').textContent(), /1–24 \/ 500/);
    await page.locator('#episode-next').click();
    assert.equal(await page.locator('#episodes button').first().textContent(), 'Tập 25');
    await page.screenshot({ path: path.join(artifacts, 'detail.png') });
    assert.ok(await page.locator('#detail-status').evaluate(node => node.getBoundingClientRect().bottom <= 1080));
    pass('500 episodes rendered as 24-button pages; detail fits on screen');
    await page.locator('#play').click();
    await page.waitForFunction(() => window.__av.name === 'PLAYING');
    assert.equal(await page.locator('#home canvas[data-painted="true"]').count(), 0);
    assert.ok(await page.evaluate(() => window.__av.calls.some(call => call[0] === 'prepareAsync')));
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor), 'rgba(0, 0, 0, 0)');
    assert.equal(await page.evaluate(() => window.__av.calls.some(call => call[0] === 'prepare')), false);
    await page.evaluate(() => window.__av.listener.oncurrentplaytime(120000));
    await page.locator('#pause').click();
    assert.equal(await page.evaluate(() => window.__av.name), 'PAUSED');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('khophim_tv_watch_history'))[0]);
    assert.equal(saved.positionMs, 120000);
    assert.equal(saved.episodeSlug, 'tap-1');
    await page.locator('#player-back').click();
    assert.equal(await page.evaluate(() => window.__av.name), 'NONE');
    await page.locator('#play').click();
    await page.waitForFunction(() => window.__av.name === 'PLAYING');
    assert.ok(await page.evaluate(() => window.__av.calls.some(call => call[0] === 'seekTo' && call[1] === 120000)));
    pass('AVPlay async state order, pause saves history, close releases, resume seeks');
    await page.evaluate(() => window.__av.listener.oncurrentplaytime(130000));
    const beforeSeeks = await page.evaluate(() => window.__av.calls.filter(call => call[0] === 'seekTo').length);
    await page.evaluate(() => { for (let index = 0; index < 10; index++) document.querySelector('#forward').click(); });
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => window.__av.calls.filter(call => call[0] === 'seekTo').length), beforeSeeks + 1);
    assert.equal(await page.evaluate(() => window.__av.calls.filter(call => call[0] === 'seekTo').slice(-1)[0][1]), 230000);
    pass('Rapid seek requests coalesce into one AVPlay seek');
    await page.evaluate(() => window.__av.listener.onstreamcompleted());
    await page.waitForFunction(() => window.__av.name === 'PLAYING' && document.querySelector('#now-playing').textContent.indexOf('Tập 2') !== -1);
    const finished = await page.evaluate(() => JSON.parse(localStorage.getItem('khophim_tv_watch_history'))[0]);
    assert.equal(finished.positionMs, 0);
    pass('Playback completion clears progress and opens next episode');
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    assert.equal(await page.evaluate(() => window.__av.name), 'NONE');
    assert.equal(await page.locator('#detail').isVisible(), true);
    pass('Leaving app releases the player and returns to episode selection');
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
      window.__av.manual = true;
    });
    await page.locator('#play').click();
    await page.locator('#player-back').click();
    const playCount = await page.evaluate(() => window.__av.calls.filter(call => call[0] === 'play').length);
    await page.evaluate(() => window.__av.pending.slice(-1)[0].success());
    assert.equal(await page.evaluate(() => window.__av.calls.filter(call => call[0] === 'play').length), playCount);
    assert.equal(await page.evaluate(() => window.__av.name), 'NONE');
    pass('Late prepare callback cannot restart a closed player');
    await page.evaluate(() => { window.__av.manual = false; });
    await page.locator('#play').click();
    await page.waitForFunction(() => window.__av.name === 'PLAYING');
    await page.evaluate(() => window.__av.listener.onerror('PLAYER_ERROR_CONNECTION_FAILED'));
    assert.equal(await page.evaluate(() => window.__av.name), 'NONE');
    assert.match(await page.locator('#player-message').textContent(), /chọn|đổi nguồn/);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    pass('AVPlay error closes decoder and remains navigable with Return');
    await page.locator('#menu button').first().click();
    for (let i = 0; i < 6; i++) { await page.keyboard.press('ArrowDown'); await page.waitForTimeout(90); }
    assert.equal(await page.locator('#menu button').last().evaluate(node => document.activeElement === node), true);
    assert.ok(await page.locator('#menu button').last().evaluate(node => node.getBoundingClientRect().bottom <= 1080));
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#settings').isVisible(), true);
    pass('Remote reaches hidden menu items and activates settings');
    await page.locator('#menu button').nth(0).click();
    await page.locator('#search-input').fill('old');
    await page.locator('#search-button').click();
    await page.locator('#search-input').fill('new');
    await page.locator('#search-button').click();
    await page.waitForFunction(() => document.querySelector('#grid .tv-card-title') && document.querySelector('#grid .tv-card-title').textContent.indexOf('new ') === 0);
    await page.waitForTimeout(300);
    assert.match(await page.locator('#grid .tv-card-title').first().textContent(), /^new /);
    assert.equal(await page.locator('#grid .tv-card').count(), 6);
    pass('Canceled old searches cannot overwrite new results');
    await page.evaluate(() => document.querySelector('#grid .tv-card').focus());
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#grid .tv-card').nth(1).evaluate(node => node === document.activeElement), true);
    await page.waitForTimeout(100);
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('#next').evaluate(node => node === document.activeElement), true);
    await page.waitForTimeout(100);
    await page.keyboard.press('ArrowUp');
    assert.equal(await page.locator('#grid .tv-card').nth(1).evaluate(node => node === document.activeElement), true);
    pass('Remote grid navigation tracks original responsive poster columns');
    mode.offline = true;
    const offline = await context.newPage();
    await offline.goto(base);
    await offline.waitForFunction(() => window.KhoBoot.ready && document.querySelector('#hero-overview').textContent.indexOf('Không tải') !== -1);
    assert.equal(await offline.locator('#menu button').count(), 7);
    await offline.locator('#menu button').last().click();
    assert.equal(await offline.locator('#settings').isVisible(), true);
    await offline.evaluate(() => {
      localStorage.setItem('unrelated-data', 'keep');
      localStorage.setItem('khophim_tv_watch_history', '{corrupted');
    });
    assert.equal(await offline.evaluate(() => window.KhoCore.history().length), 0);
    await offline.locator('#clear-history').click();
    assert.equal(await offline.evaluate(() => localStorage.getItem('unrelated-data')), 'keep');
    pass('Offline boot, settings, corrupt history recovery, scoped history deletion');
    await offline.evaluate(() => { for (let index = 0; index < 60; index++) window.KhoCore.save({ slug: 'film-' + index, name: 'Film' }); });
    assert.equal(await offline.evaluate(() => window.KhoCore.history().length), 40);
    assert.equal(await offline.evaluate(() => window.KhoCore.safeUrl('javascript:alert(1)')), '');
    assert.equal(await offline.evaluate(() => window.KhoCore.stream({ link_embed: 'https://embed.example/?url=https%3A%2F%2Fcdn.example%2Fvideo.m3u8' })), 'https://cdn.example/video.m3u8');
    pass('History bounded at 40; unsafe URL rejected; direct HLS extracted safely');
    await offline.close();
    mode.offline = false;
    mode.failDetail = true;
    await page.locator('#grid .tv-card').first().click();
    await page.waitForFunction(() => document.querySelector('#detail-title').textContent === 'Chưa tải được thông tin phim');
    await page.locator('#detail-back').click();
    assert.equal(await page.locator('#detail').isVisible(), false);
    assert.equal(apiRequests.some(url => url.indexOf('ophim1.com') !== -1), false);
    pass('Primary detail API failure shows retry and permits returning without a request to the dead backup');
    mode.failDetail = false;
    await page.evaluate(() => localStorage.setItem('khophim_tv_watch_history', JSON.stringify([{ slug: 'phim-0', name: 'Phim xem tiếp', poster_url: 'https://images.example/poster.png', banner: 'https://images.example/banner.png', episodeSlug: 'tap-1', episodeName: 'Tập 1', serverName: 'Vietsub', positionMs: 90000, durationMs: 3600000 }])));
    await page.locator('#menu [data-tab="home"]').click();
    await page.locator('#continue-row .tv-continue-card').first().click();
    await page.waitForFunction(() => window.__av.name === 'PLAYING');
    assert.ok(await page.evaluate(() => window.__av.calls.some(call => call[0] === 'seekTo' && call[1] === 90000)));
    await page.evaluate(() => window.__av.listener.oncurrentplaytime(100000));
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#continue-row .tv-continue-card').first().evaluate(node => node === document.activeElement), true);
    await page.waitForFunction(() => document.querySelectorAll('#home canvas[data-painted="true"]').length > 0);
    pass('Original Continue Watching row resumes and restores focus after progress updates');
    await page.locator('#menu [data-tab="settings"]').click();
    await page.locator('#clear-cache').click();
    assert.equal(await page.evaluate(() => window.KhoPosters.stats().entries), 0);
    assert.equal(await page.evaluate(() => window.KhoPosters.stats().bytes), 0);
    assert.equal(await page.evaluate(() => window.KhoPosters.stats().active), 0);
    await page.locator('#menu [data-tab="home"]').click();
    await page.waitForFunction(() => document.querySelectorAll('[data-shelf="0"] .tv-card').length === 6);
    assert.ok(await page.locator('#shelves .tv-card').count() <= 18);
    pass('Cache clear frees thumbnail cache and old shelves, then rebuilds only the visible window');
    assert.deepEqual(errors, []);
    pass('No browser runtime errors across all tested flows');
    fs.writeFileSync(path.join(artifacts, 'results.json'), JSON.stringify({ passed: results.length, tests: results, browser: browser.version(), note: 'AVPlay mocked; physical TV and certificate signing not tested.' }, null, 2));
    console.log('Total: ' + results.length + ' passed');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}()).catch(error => { console.error(error); process.exitCode = 1; });
