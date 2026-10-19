/* Isolated fixture browsers: new catalog only, retained legacy history and explicit search. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium, webkit } = require('playwright');
const root = path.resolve(__dirname, '../..');
const gateway = 'https://khophimqd.vercel.app/source';
const poster = 'https://cdn.phimsrv.com/tuphim-fixture.png';
const title = 'Phim lịch sử cũ (2020)';
const movie = { slug: 'tp--fixture', name: 'Phim Tủ Phim (2026)', poster_url: poster, thumb_url: poster, year: 2026, quality: 'HD', lang: 'Vietsub' };
async function main() {
  const server = http.createServer((request, response) => {
    let file = path.resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
    if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { response.writeHead(404).end(); return; }
    response.writeHead(200, { 'Content-Type': ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png' })[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(response);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    const safari = process.argv.includes('--webkit');
    browser = safari ? await webkit.launch({ headless: true }) : await chromium.launch({ channel: 'msedge', headless: true });
    for (const surface of safari ? ['mobile', 'desktop', 'tv'] : ['mobile', 'desktop', 'tv', 'samsung']) {
      const mobile = surface === 'mobile', desktop = surface === 'desktop';
      const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1366, height: 900 }, isMobile: mobile, hasTouch: mobile });
      const requests = [], errors = [];
      await context.addInitScript(({ movie, poster, title }) => {
        const rows = [
          { movieSlug: 'old-source-film', movieTitle: title, posterUrl: 'https://legacy-images.example/old.png', bannerUrl: 'https://legacy-images.example/old-banner.png', episodeSlug: 'tap-2', episodeName: 'Tập 2', serverName: 'Vietsub', positionMs: 65000, durationMs: 120000, timestamp: Date.now() - 100 },
          { movieSlug: movie.slug, movieTitle: movie.name, posterUrl: poster, bannerUrl: poster, episodeSlug: 'tap-1', episodeName: 'Tập 1', serverName: 'Vietsub', positionMs: 15000, durationMs: 120000, timestamp: Date.now() - 200 }
        ];
        localStorage.setItem('khophim_history', JSON.stringify(rows));
        localStorage.setItem('khophim_tv_watch_history', JSON.stringify(rows.map(row => ({ ...row, slug: row.movieSlug, title: row.movieTitle, name: row.movieTitle, poster: row.posterUrl, banner: row.bannerUrl }))));
      }, { movie, poster, title });
      await context.route('**/sync/config.js*', route => route.fulfill({ contentType: 'text/javascript', body: 'window.KHO_SYNC_CONFIG={enabled:false};' }));
      await context.route(gateway + '/**', route => {
        const url = new URL(route.request().url());
        assert.equal(/thuyet-minh|long-tieng/.test(url.pathname), false, 'Unsupported audio-only catalog must not be requested');
        if (url.pathname.includes('/phim/')) {
          assert.equal(url.pathname, '/source/phim/' + movie.slug, 'Only a current source slug may be resolved');
          return route.fulfill({ json: { status: true, movie, episodes: ['Vietsub', 'Thuyết Minh'].map(server_name => ({ server_name, server_data: [{ slug: 'tap-1', name: 'Tập 1', link_m3u8: gateway + '/stream/public-fixture/index.m3u8' }] })) } });
        }
        // Even a stale response item is excluded before rendering.
        const items = [movie, { ...movie, slug: 'stale-catalog-entry', name: 'Retired catalog card' }];
        return route.fulfill({ json: { status: true, items, data: { items, APP_DOMAIN_CDN_IMAGE: 'https://cdn.phimsrv.com', params: { pagination: { totalItems: 1, totalItemsPerPage: 6, totalPages: 1 } } } } });
      });
      await context.route('https://cdn.phimsrv.com/**', route => route.fulfill({ contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(path.join(root, 'tv-samsung-tizen/icon.png')) }));
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => requests.push(request.url()));
      const pathname = mobile ? '/docs/?mode=mobile' : surface === 'samsung' ? '/tv-samsung-tizen/' : '/docs/' + surface + '/';
      await page.goto('http://127.0.0.1:' + server.address().port + pathname);
      const currentCard = mobile ? '.movie-card' : '.tv-card[data-slug="tp--fixture"]';
      await page.locator(currentCard).first().waitFor();
      assert.equal(await page.getByText('Retired catalog card', { exact: true }).count(), 0);
      const continueCards = mobile ? '#continue-watching-section .continue-card' : desktop ? '#tv-continue-row .tv-continue-card' : '#continue-row .tv-continue-card';
      assert.equal(await page.locator(continueCards).count(), 1, surface + ' current source only in Continue Watching');
      await page.locator('[data-tab="history"]').click();
      const historyCards = mobile ? '#history-list .history-item' : desktop ? '#tv-history-grid .tv-continue-card' : '#grid .tv-continue-card';
      assert.equal(await page.locator(historyCards).count(), 2, 'History records remain visible');
      const legacy = page.locator(historyCards).filter({ hasText: title });
      assert.match(await legacy.innerText(), /Nguồn cũ đã ngừng dùng/);
      await legacy.click();
      const input = page.locator(mobile ? '#search-input' : desktop ? '#tv-search-input' : '#search-input');
      assert.equal(await input.inputValue(), title, 'Search is seeded from the exact saved title without selecting a match');
      const status = page.locator(mobile ? '#search-status' : desktop ? '#tv-search-status' : '#status');
      assert.match(await status.innerText(), /Nguồn cũ đã ngừng dùng\. Tìm lại phim trên Tủ Phim\./);
      assert.equal(requests.some(url => url.includes('/source/phim/old-source-film')), false);
      await input.fill('Phim Tủ Phim');
      if (!mobile && !desktop) await page.locator('#search-button').click();
      const searchCard = mobile ? '#search-grid .movie-card' : desktop ? '#tv-search-grid .tv-card' : '#grid .tv-card';
      await page.locator(searchCard).first().waitFor();
      await page.locator(searchCard).first().click();
      const serverButtons = mobile ? '.server-btn' : desktop ? '.tv-server-pill' : '#servers button';
      await page.locator(serverButtons).first().waitFor();
      assert.equal(await page.locator(serverButtons).count(), 2, 'Audio/server choices remain on movie detail');
      assert.equal(requests.some(url => /phimapi\.com|phimmoi[^/]*\.|ophim1\.com|phimimg\.com|legacy-images\.example/.test(new URL(url).hostname)), false, 'No retired catalog or legacy image requests');
      assert.deepEqual(errors, [], surface + ' no browser runtime errors');
      console.log('PASS ' + surface + ': exclusive Tủ Phim catalog, current-only continue, retained legacy history, search guidance and server/audio list; ' + (safari ? 'WebKit' : 'Edge'));
      await context.close();
    }
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
