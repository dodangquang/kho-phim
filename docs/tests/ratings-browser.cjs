'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium, webkit } = require('playwright');
const root = path.resolve(__dirname, '../..');
const poster = 'https://cdn.phimsrv.com/rating-fixture.svg';
const attack = process.argv.includes('--xss');
const injected = '<img src=x onerror="window.__xss=1">';
const movies = [
  { slug: 'tp--rated', name: 'Phim có điểm', imdb: { vote_average: 8.1, vote_count: 900 }, tmdb: { vote_average: 9, vote_count: 1 } },
  { slug: 'tp--fallback', name: 'Điểm dự phòng', imdb: { vote_average: 0, vote_count: 0 }, tmdb: { vote_average: 7.2, vote_count: 8 } },
  { slug: 'tp--unrated', name: 'Phim chưa có điểm' }
].map(item => ({ ...item, poster_url: poster, thumb_url: poster, quality: 'HD', year: 2026 }));
if (attack) movies.forEach(movie => Object.assign(movie, { name: injected, quality: injected, episode_current: injected, year: injected, origin_name: injected, content: injected, director: injected, actor: [injected], category: [{name:injected}] }));
async function main() {
  const server = http.createServer((request,response) => {
    let file = path.resolve(root, '.'+decodeURIComponent(new URL(request.url,'http://localhost').pathname));
    if (!file.startsWith(root+path.sep)) { response.writeHead(403).end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file,'index.html');
    if (!fs.existsSync(file)) { response.writeHead(404).end(); return; }
    response.writeHead(200, { 'Content-Type': ({'.js':'text/javascript','.html':'text/html','.css':'text/css','.png':'image/png'})[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(response);
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  let browser;
  try {
    const safari = process.argv.includes('--webkit');
    browser = safari ? await webkit.launch({headless:true}) : await chromium.launch({channel:'msedge',headless:true});
    const surfaces = safari ? ['mobile'] : ['mobile','desktop','tv','samsung'];
    for (const surface of surfaces) {
      const mobile = surface === 'mobile';
      const context = await browser.newContext({viewport:mobile ? {width:390,height:844} : {width:1366,height:768},isMobile:mobile,hasTouch:mobile});
      const page = await context.newPage(), errors=[];
      await page.route('**/announcement.json', route => route.fulfill({ json: { active: false }, headers: { 'Access-Control-Allow-Origin': '*' } }));
      page.on('pageerror', error => errors.push(error.message));
      await page.route('https://khophimqd.vercel.app/source/**', route => {
        const slug = new URL(route.request().url()).pathname.split('/phim/')[1];
        return route.fulfill({json:slug ? {status:true,movie:movies.find(movie=>movie.slug===slug)||movies[0],episodes:attack ? [{server_name:injected,server_data:[{slug:'tap-1',name:injected,link_m3u8:'https://media.test/fixture.m3u8'}]}] : []} : {status:true,items:movies,data:{items:movies,params:{pagination:{totalPages:1,currentPage:1}}}}});
      });
      await page.route('https://cdn.phimsrv.com/**', route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450"><rect width="300" height="450" fill="#26384a"/></svg>'}));
      const url = surface==='mobile' ? '/docs/?mode=mobile' : surface==='samsung' ? '/tv-samsung-tizen/' : '/docs/'+surface+'/';
      await page.goto('http://127.0.0.1:'+server.address().port+url);
      const cardSelector = mobile ? '.movie-card' : '.tv-card';
      await page.locator(cardSelector).first().waitFor();
      for (const [slug,label] of [['tp--rated','★ IMDb 8.1'],['tp--fallback','★ TMDB 7.2'],['tp--unrated','']]) {
        const index = movies.findIndex(movie=>movie.slug===slug);
        const card = mobile ? page.locator(cardSelector).nth(index) : page.locator(cardSelector+'[data-slug="'+slug+'"]').first();
        assert.equal(await card.locator('.movie-rating,.tv-card-rating').count(), label ? 1 : 0, surface+' badge presence');
        if(label) assert.equal(await card.locator('.movie-rating,.tv-card-rating').innerText(),label);
      }
      await page.locator(cardSelector).first().click();
      const detail = page.locator(mobile ? '#detail-modal .movie-rating-detail' : surface==='desktop' ? '#tv-detail-rating' : '#detail-rating');
      await detail.waitFor();
      assert.equal(await detail.innerText(),'★ IMDb 8.1/10 · 900 lượt đánh giá');
      if (attack) { await page.waitForTimeout(100); assert.equal(await page.evaluate(()=>window.__xss || 0),0,'API text must not execute HTML'); }
      assert.deepEqual(errors,[],surface+' JS errors');
      if (mobile && process.env.KHOPHIM_TEST_OUTPUT) await page.screenshot({path:path.join(process.env.KHOPHIM_TEST_OUTPUT,'ratings-mobile-'+(safari?'webkit':'edge')+'.png')});
      console.log('PASS '+surface+': IMDb, TMDB fallback, missing score, detail votes'+(attack?', API HTML escaped':'')+'; '+(safari?'WebKit':'Edge'));
      await context.close();
    }
  } finally { if(browser) await browser.close(); await new Promise(resolve=>server.close(resolve)); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
