'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createSource, movie, publicEpisode, withSubtitles, secureUrl, isPrivate } = require('../../lib/tuphim');
function fixture(episode) {
  const key = 'public-fixture-key';
  const url = 'https://media.example.org/path/master.m3u8?token=fixture';
  const encrypted_url = Array.from(url, (c, i) => (c.charCodeAt(0) ^ key.charCodeAt(i % key.length)).toString(16).padStart(2, '0')).join('');
  return '<script>let config={publicKey:' + JSON.stringify(key) + ',episode:' + JSON.stringify({ encrypted_url, ...episode }) + '};neverExecute()</script>';
}
function mocked(routes) {
  const requests = [];
  const source = createSource({ lookup: async () => [{ address: '93.184.216.34' }], fetchImpl: async (url, options) => {
    requests.push({ url, options });
    const value = routes[url];
    if (value === undefined) throw Error('Unexpected URL ' + url);
    return new Response(typeof value === 'string' ? value : JSON.stringify(value), { status: 200 });
  }});
  return { source, requests };
}
test('public catalogue gets a new identity, real ratings and absolute provider images', () => {
  const row = movie({ id: 5, primarySlug: 'example-film', name: 'Film', updatedAt: '2026-10-19', imdbVoteAverage: 8.3, imdbVoteCount: 120, posterPathOriginal: 'https://cdn.phimsrv.com/a.webp' });
  assert.equal(row.slug, 'tp--example-film');
  assert.equal(row.modified.time, '2026-10-19');
  assert.equal(row.imdb.vote_average, 8.3);
  assert.equal(row.poster_url, 'https://cdn.phimsrv.com/a.webp');
  assert.equal(movie({ primarySlug: 'card', posterPath300: 'https://cdn.phimsrv.com/card/poster_300.webp', posterPathOriginal: 'https://cdn.phimsrv.com/card/poster_original.webp' }).poster_url, 'https://cdn.phimsrv.com/card/poster_300.webp');
  assert.equal(movie({ primarySlug: 'vip', vipOnly: true }), null);
  assert.equal(movie({ primarySlug: 'x'.repeat(177) }), null);
});
test('public player config is parsed as inert JSON and only ordinary HTTPS HLS is accepted', () => {
  const data = publicEpisode(fixture({ subtitles: [{ lang: 'vi', label: 'Tiếng Việt', url: 'https://media.example.org/sub/vi.vtt' }] }));
  assert.equal(data.url, 'https://media.example.org/path/master.m3u8?token=fixture');
  assert.equal(data.subtitles[0].lang, 'vi');
  assert.throws(() => publicEpisode('<script>config=process.exit()</script>'));
  assert.throws(() => publicEpisode(fixture({ encrypted_url: 'GG' })));
});
test('legacy detail and unsupported catalogues fail without contacting any provider', async () => {
  const { source, requests } = mocked({});
  await assert.rejects(source('phim/old-film'), { status: 410 });
  await assert.rejects(source('v1/api/danh-sach/unknown-audio'), { status: 404 });
  await assert.rejects(source('phim/tp--../bad'), { status: 400 });
  await assert.rejects(source('stream/../../index.m3u8'), { status: 404 });
  assert.equal(requests.length, 0);
});
test('audio categories use langKeys, retain independent pagination and never mix labels', async () => {
  const routes = {};
  for (const key of ['lt', 'tm']) for (const page of [1, 2]) routes['https://api.phimsrv.com/v1/movies?page=' + page + '&limit=24&langKeys=' + key] = { ok: true, data: { page, limit: 24, total: 48, totalPages: 2, items: [{ primarySlug: key + '-' + page, langKeys: ['vs', key], lang: 'Vietsub' }] } };
  const { source, requests } = mocked(routes);
  for (const [category, key] of [['phim-long-tieng', 'lt'], ['phim-thuyet-minh', 'tm']]) for (const page of [1, 2]) {
    const { json } = await source('v1/api/danh-sach/' + category, new URLSearchParams({ page: String(page) }));
    assert.equal(json.audio, key);
    assert.equal(json.items[0].slug, 'tp--' + key + '-' + page);
    assert.equal(json.items[0].audio_preference, key);
    assert.ok(json.items[0].lang_keys.includes(key));
    assert.equal(json.data.params.pagination.currentPage, page);
    assert.equal(json.data.params.pagination.totalPages, 2);
  }
  assert.equal(requests.length, 4);
});
test('audio category fails clearly if upstream ignores the requested language', async () => {
  const { source } = mocked({ 'https://api.phimsrv.com/v1/movies?page=1&limit=24&langKeys=lt': { ok: true, data: { items: [{ primarySlug: 'sub-only', langKeys: ['vs'] }] } } });
  await assert.rejects(source('v1/api/danh-sach/phim-long-tieng'), { status: 502 });
});
test('search and filters use public API only, preserve pagination and exclude VIP', async () => {
  const url = 'https://api.phimsrv.com/v1/movies?page=2&limit=24&search=ultraman+tiga';
  const { source, requests } = mocked({ [url]: { ok: true, data: { page: 2, limit: 24, total: 48, totalPages: 2, items: [{ primarySlug: 'a' }, { primarySlug: 'b', vipOnly: true }] } } });
  const r = await source('v1/api/tim-kiem', new URLSearchParams({ keyword: 'ultraman tiga', page: '2' }));
  assert.equal(r.json.data.items.length, 1);
  assert.equal(r.json.data.params.pagination.totalPages, 2);
  assert.equal(r.json.items[0].slug, 'tp--a');
  await source('v1/api/tim-kiem', new URLSearchParams({ keyword: 'ultraman tiga', page: '2' }));
  assert.equal(requests.length, 1);
  assert.deepEqual(Object.keys(requests[0].options.headers), ['Accept']);
});
test('detail loads later episode pages on the original source index', async () => {
  const { source, requests } = mocked({
    'https://api.phimsrv.com/v1/movies/series': { ok: true, data: { movie: { primarySlug: 'series' }, watchSources: [
      { sourceIndex: 1, nickname: 'Gold [LT]', hasEpisodes: true, episodes: [{ hash: 'goldhash', name: '1', slug: 'tap-1', useMedia: true }] },
      { sourceIndex: 0, nickname: 'Diamond [VS]', hasEpisodes: true, episodePagination: { totalPages: 2 }, episodes: [{ hash: '12345678', name: '1', slug: 'tap-1', useMedia: true }] },
      { sourceIndex: 2, nickname: 'Iframe', hasEpisodes: true, episodes: [{ hash: 'external', name: '1', slug: 'tap-1', useMedia: false, embedUrl: 'https://player.example.org/embed' }] }
    ] } },
    'https://api.phimsrv.com/v1/movies/series/episodes?sourceIndex=0&page=2&limit=100': { ok: true, data: { episodes: [{ hash: 'abcdefgh', name: '101', slug: 'tap-101', useMedia: true }] } }
  });
  const r = await source('phim/tp--series');
  assert.equal(r.json.episodes[0].server_data.length, 2);
  assert.deepEqual(r.json.episodes.map(s => s.server_name), ['Diamond [VS]', 'Gold [LT]']);
  assert.match(r.json.episodes[0].server_data[1].link_m3u8, /\/source\/stream\/abcdefgh\/index\.m3u8$/);
  assert.equal(r.json.episodes[0].server_data[0].link_embed, '');
  assert.equal(requests.length, 2);
  const preferred = await source('phim/tp--series', new URLSearchParams({ audio: 'lt' }));
  assert.equal(preferred.json.episodes[0].server_name, 'Gold [LT]');
  assert.equal(preferred.json.movie.audio_preference, 'lt');
  const missing = await source('phim/tp--series', new URLSearchParams({ audio: 'tm' }));
  assert.match(missing.json.movie.audio_notice, /Chưa thấy server ghi nhãn Thuyết minh/);
  await assert.rejects(source('phim/tp--series', new URLSearchParams({ audio: 'arbitrary' })), { status: 400 });
});
test('upstream errors do not fall back to retired source', async () => {
  let count = 0;
  const source = createSource({ fetchImpl: async () => { count++; return new Response('Unavailable', { status: 503 }); } });
  await assert.rejects(source('danh-sach/phim-moi-cap-nhat'), { status: 502 });
  assert.equal(count, 1);
});
test('HLS manifests rewrite relative resources and carry Vietnamese subtitles', () => {
  const tracks = [{ lang: 'vi', label: 'Tiếng Việt', url: 'https://media.example.org/sub.vtt' }];
  const master = withSubtitles('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=3000000\n720/index.m3u8\n', 'https://media.example.org/path/master.m3u8', tracks, 'https://khophimqd.vercel.app/source/stream/12345678');
  assert.match(master, /LANGUAGE="vi",DEFAULT=YES/);
  assert.match(master, /BANDWIDTH=3000000,SUBTITLES="kho-sub"/);
  assert.match(master, /https:\/\/media.example.org\/path\/720\/index.m3u8/);
  const media = withSubtitles('#EXTM3U\n#EXTINF:10,\nsegment.ts\n#EXT-X-ENDLIST', 'https://media.example.org/media.m3u8', tracks, 'https://khophimqd.vercel.app/source/stream/12345678');
  assert.match(media, /#EXT-X-STREAM-INF:.*SUBTITLES/);
  assert.match(media, /https:\/\/media.example.org\/media.m3u8/);
  assert.throws(() => withSubtitles('#EXTM3U\n#EXT-X-KEY:METHOD=SAMPLE-AES,URI="key"', 'https://example.org/a.m3u8', [], 'https://example.org'), { status: 502 });
});
test('stream resolver fetches only bounded manifests, supports subtitles, no video proxy', async () => {
  const { source, requests } = mocked({
    'https://api.phimsrv.com/v1/embed/12345678': fixture({ subtitles: [{ lang: 'vi', url: 'https://media.example.org/sub.vtt' }] }),
    'https://media.example.org/path/master.m3u8?token=fixture': '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=3000000\n720/index.m3u8\n'
  });
  const r = await source('stream/12345678/index.m3u8');
  assert.match(r.hls, /subtitle-0\.m3u8/);
  const s = await source('stream/12345678/subtitle-0.m3u8');
  assert.match(s.hls, /https:\/\/media.example.org\/sub.vtt/);
  assert.equal(requests.length, 2);
  assert.ok(requests.every(r => !r.url.endsWith('.ts')));
});
test('media URLs reject credentials, local destinations and private DNS', async () => {
  for (const u of ['http://example.org/a', 'https://127.0.0.1/a', 'https://user:pass@example.org/a', 'https://localhost/a', 'https://a.internal/a', 'https://example.org:8080/a']) assert.equal(secureUrl(u), '');
  for (const a of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '172.16.0.1', '192.168.1.1', '::1', 'fd00::1', '::ffff:127.0.0.1']) assert.ok(isPrivate(a));
  assert.equal(isPrivate('8.8.8.8'), false);
  const source = createSource({ fetchImpl: async () => new Response(fixture({ subtitles: [{ lang: 'vi', url: 'https://media.example.org/sub.vtt' }] })), lookup: async () => [{ address: '127.0.0.1' }] });
  await assert.rejects(source('stream/12345678/index.m3u8'), { status: 502 });
});
test('ordinary HLS without external subtitles goes directly to the public CDN', async () => {
  const { source, requests } = mocked({ 'https://api.phimsrv.com/v1/embed/12345678': fixture({}) });
  const result = await source('stream/12345678/index.m3u8');
  assert.equal(result.redirect, 'https://media.example.org/path/master.m3u8?token=fixture');
  assert.equal(requests.length, 1, 'No data-centre fetch or video proxy is needed');
});
test('invalid pagination is rejected before upstream access', async () => {
  const { source, requests } = mocked({});
  for (const page of ['-1', 'NaN', '1.5', '100001']) await assert.rejects(source('danh-sach/phim-moi-cap-nhat', new URLSearchParams({ page })), { status: 400 });
  assert.equal(requests.length, 0);
});
