'use strict';

// Public catalogue adapter. No upstream account, cookie, API key or video-byte proxy.
const dns = require('node:dns/promises');
const net = require('node:net');
const { filterAds, ordinaryPlaylist, filterableHost } = require('./hls-ads');
const API = 'https://api.phimsrv.com/v1';
const PREFIX = 'tp--';
const HASH = /^[a-zA-Z0-9_-]{8,128}$/;
const SLUG = /^[a-zA-Z0-9_-]{1,176}$/;
const ORIGIN = 'https://khophimqd.vercel.app';
class SourceError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function positive(value, fallback, max) {
  if (value == null || value === '') return fallback;
  if (!/^\d+$/.test(String(value)) || +value < 1 || +value > max) throw new SourceError(400, 'Tham số không hợp lệ.');
  return +value;
}
function secureUrl(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' || u.username || u.password || u.port || net.isIP(u.hostname) || !u.hostname.includes('.') || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(u.hostname)) return '';
    return u.href;
  } catch (_) { return ''; }
}
function image(raw) {
  const u = secureUrl(raw);
  return u && new URL(u).hostname === 'cdn.phimsrv.com' ? u : '';
}
function movie(item, detail = {}) {
  if (!item || item.vipOnly || !SLUG.test(item.primarySlug || '')) return null;
  const list = (rows) => (Array.isArray(rows) ? rows : []).map(x => ({ id: String(x.id || x.slug || ''), name: String(x.name || ''), slug: String(x.slug || '') }));
  return {
    _id: String(item.id || ''), slug: PREFIX + item.primarySlug, name: String(item.name || item.primarySlug),
    origin_name: String(item.originName || ''), content: String(item.content || ''),
    type: item.type === 'movie' ? 'single' : String(item.type || ''), status: String(item.status || ''), year: Number(item.year) || 0,
    quality: String(item.quality || ''), lang: String(item.lang || ''), time: String(item.time || ''),
    lang_keys: (Array.isArray(item.langKeys) ? item.langKeys : []).filter(key => ['vs', 'lt', 'tm'].includes(key)),
    episode_current: String(item.episodeCurrent || ''), episode_total: String(item.episodeTotal || ''),
    poster_url: image(item.posterPath300) || image(item.posterPathOriginal),
    thumb_url: image(item.thumbPathOriginal || item.thumbPath500 || item.thumbPath300),
    modified: { time: String(item.updatedAt || '') },
    category: list(detail.categories || item.categories), country: list(detail.countries || item.countries),
    actor: (detail.credits?.actors || []).map(x => String(x.name || '')),
    director: (detail.credits?.directors || []).map(x => String(x.name || '')),
    tmdb: { id: String(item.tmdbId || ''), type: String(item.tmdbType || ''), vote_average: Number(item.tmdbVoteAverage) || 0, vote_count: item.tmdbVoteCount == null ? null : Number(item.tmdbVoteCount) || 0 },
    imdb: { id: String(item.imdbId || ''), vote_average: Number(item.imdbVoteAverage) || 0, vote_count: item.imdbVoteCount == null ? null : Number(item.imdbVoteCount) || 0 }
  };
}
function publicEpisode(html) {
  // Parse inert JSON only; never execute upstream HTML/JavaScript.
  const keyMatch = html.match(/\bpublicKey\s*:\s*("(?:[^"\\]|\\.)*")/);
  const marker = /\bepisode\s*:\s*\{/.exec(html);
  if (!keyMatch || !marker) throw new SourceError(502, 'Server này chưa cung cấp nguồn phát trực tiếp. Hãy chọn server khác.');
  const start = marker.index + marker[0].lastIndexOf('{');
  let quoted = false, escaped = false, depth = 0, end = -1;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (quoted) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') quoted = false; }
    else if (c === '"') quoted = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) { end = i + 1; break; }
  }
  let key, episode;
  try { key = JSON.parse(keyMatch[1]); episode = JSON.parse(html.slice(start, end)); } catch (_) { throw new SourceError(502, 'Dữ liệu nguồn phát không hợp lệ.'); }
  const encoded = episode.encrypted_url;
  if (typeof key !== 'string' || !key || key.length > 512 || typeof encoded !== 'string' || !/^(?:[0-9a-f]{2}){1,8192}$/i.test(encoded)) throw new SourceError(502, 'Nguồn phát không được hỗ trợ.');
  let decoded = '';
  for (let i = 0; i < encoded.length; i += 2) decoded += String.fromCharCode(parseInt(encoded.slice(i, i + 2), 16) ^ (key.charCodeAt((i / 2) % key.length) & 255));
  const url = secureUrl(decoded);
  if (!url || !/\.m3u8$/i.test(new URL(url).pathname)) throw new SourceError(502, 'Server này chưa cung cấp HLS công khai.');
  const subtitles = (Array.isArray(episode.subtitles) ? episode.subtitles : []).map(s => ({
    lang: String(s.lang || 'und').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 16),
    label: String(s.label || s.lang || 'Phụ đề').slice(0, 80), url: secureUrl(s.url)
  })).filter(s => s.url && /\.vtt$/i.test(new URL(s.url).pathname)).slice(0, 12);
  return { url, subtitles };
}
function hlsQuote(value) { return String(value).replace(/["\r\n\\]/g, ''); }
function absolutePlaylist(body, base) {
  function resource(uri) {
    const resolved = secureUrl(new URL(uri, base).href);
    if (!resolved) throw new SourceError(502, 'Địa chỉ trong danh sách phát không hợp lệ.');
    return resolved;
  }
  return body.split(/\r?\n/).map(line => {
    if (line && !line.startsWith('#')) return resource(line.trim());
    return line.replace(/URI="([^"]+)"/g, (_, uri) => 'URI="' + resource(uri) + '"');
  }).join('\n');
}
function withSubtitles(body, sourceUrl, subtitles, streamBase) {
  if (!body.trimStart().startsWith('#EXTM3U')) throw new SourceError(502, 'Server trả về danh sách phát không hợp lệ.');
  // DRM/encrypted media stays with its provider; this adapter handles ordinary HLS only.
  if (/^#EXT-X-(?:SESSION-)?KEY:.*METHOD=(?!NONE)/m.test(body)) throw new SourceError(502, 'Nguồn phát mã hóa này chưa được hỗ trợ.');
  const tracks = subtitles.map((s, i) => '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="kho-sub",NAME="' + hlsQuote(s.label) + '",LANGUAGE="' + hlsQuote(s.lang) + '",DEFAULT=' + ((s.lang === 'vi' || s.lang === 'vie') ? 'YES' : 'NO') + ',AUTOSELECT=YES,URI="' + streamBase + '/subtitle-' + i + '.m3u8"');
  const absolute = absolutePlaylist(body, sourceUrl);
  if (!tracks.length) return absolute;
  if (/^#EXT-X-STREAM-INF:/m.test(absolute)) {
    // Keep the provider's subtitle groups when it already has them.
    if (/^#EXT-X-STREAM-INF:.*SUBTITLES=/m.test(absolute)) return absolute;
    return absolute.replace('#EXTM3U', '#EXTM3U\n' + tracks.join('\n')).replace(/^(#EXT-X-STREAM-INF:[^\r\n]*)/gm, '$1,SUBTITLES="kho-sub"');
  }
  return '#EXTM3U\n#EXT-X-VERSION:3\n' + tracks.join('\n') + '\n#EXT-X-STREAM-INF:BANDWIDTH=6000000,SUBTITLES="kho-sub"\n' + sourceUrl + '\n';
}
function isPrivate(address) {
  if (net.isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a === 100 && b >= 64 && b <= 127 || a >= 224;
  }
  const a = address.toLowerCase();
  return a === '::' || a === '::1' || a.startsWith('fc') || a.startsWith('fd') || a.startsWith('fe8') || a.startsWith('fe9') || a.startsWith('fea') || a.startsWith('feb') || a.startsWith('::ffff:');
}
function createSource({ fetchImpl = fetch, lookup = dns.lookup, origin = ORIGIN, now = Date.now } = {}) {
  const cache = new Map(), flights = new Map();
  let cacheBytes = 0, active = 0;
  async function cached(key, ttl, work) {
    const hit = cache.get(key);
    if (hit && hit.until > now()) return hit.value;
    if (flights.has(key)) return flights.get(key);
    if (active >= 24) throw new SourceError(503, 'Nguồn phim đang bận. Vui lòng thử lại.');
    active++;
    const promise = (async () => {
      const value = await work(), size = Buffer.byteLength(JSON.stringify(value));
      if (cache.has(key)) { cacheBytes -= cache.get(key).size; cache.delete(key); }
      while (cache.size >= 100 || cacheBytes + size > 12 * 1024 * 1024) {
        const first = cache.keys().next().value;
        if (first === undefined) break;
        cacheBytes -= cache.get(first).size; cache.delete(first);
      }
      if (size < 2 * 1024 * 1024) { cache.set(key, { value, size, until: now() + ttl }); cacheBytes += size; }
      return value;
    })().finally(() => { flights.delete(key); active--; });
    flights.set(key, promise); return promise;
  }
  async function read(url, { media = false, maxBytes = 2 * 1024 * 1024, timeoutMs = 12000 } = {}) {
    for (let redirects = 0; redirects < 4; redirects++) {
      if (media) {
        const safe = secureUrl(url);
        if (!safe) throw new SourceError(502, 'Địa chỉ nguồn phát không hợp lệ.');
        const records = await lookup(new URL(safe).hostname, { all: true });
        if (!records.length || records.some(x => isPrivate(x.address))) throw new SourceError(502, 'Địa chỉ nguồn phát không được hỗ trợ.');
      }
      const response = await fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs), headers: { Accept: media ? 'application/vnd.apple.mpegurl,text/plain' : 'application/json,text/html' } });
      if (response.status >= 300 && response.status < 400) {
        const next = new URL(response.headers.get('location') || '', url);
        if (!media && next.origin !== new URL(API).origin) throw new SourceError(502, 'Nguồn phim chuyển hướng không hợp lệ.');
        url = next.href; continue;
      }
      if (!response.ok) {
        const error = new SourceError(response.status === 404 ? 404 : 502, media ? 'Server phát đang lỗi. Vui lòng chọn server khác.' : 'Tủ Phim chưa trả được dữ liệu. Vui lòng thử lại hoặc chọn server khác.');
        error.upstreamStatus = response.status;
        throw error;
      }
      if (Number(response.headers.get('content-length')) > maxBytes) throw new SourceError(502, 'Dữ liệu nguồn vượt giới hạn.');
      const reader = response.body.getReader(), chunks = []; let size = 0;
      try {
        for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > maxBytes) throw new SourceError(502, 'Dữ liệu nguồn vượt giới hạn.'); chunks.push(Buffer.from(value)); }
      } finally { await reader.cancel().catch(() => {}); }
      return { body: Buffer.concat(chunks).toString('utf8'), url };
    }
    throw new SourceError(502, 'Nguồn phim chuyển hướng quá nhiều lần.');
  }
  async function json(path, ttl = 90000) {
    return cached('api:' + path, ttl, async () => {
      const { body } = await read(API + path); let parsed;
      try { parsed = JSON.parse(body); } catch (_) { throw new SourceError(502, 'Tủ Phim trả dữ liệu không hợp lệ.'); }
      if (!parsed.ok || !parsed.data) throw new SourceError(502, 'Không tải được dữ liệu Tủ Phim.');
      return parsed.data;
    });
  }
  async function resolve(hash) {
    if (!HASH.test(hash)) throw new SourceError(400, 'Tập phim không hợp lệ.');
    return cached('stream:' + hash, 20000, async () => publicEpisode((await read(API + '/embed/' + hash, { maxBytes: 256 * 1024 })).body));
  }
  async function playlist(url) {
    return cached('manifest:' + url, 15000, async () => {
      const result = await read(url, { media: true, maxBytes: 1024 * 1024, timeoutMs: 6500 });
      if (!result.body.trimStart().startsWith('#EXTM3U')) throw new SourceError(502, 'Server trả về danh sách phát không hợp lệ.');
      return result;
    });
  }
  function playlistLinks(body, url) {
    const links = [];
    if (!/^#EXT-X-STREAM-INF:/m.test(body)) return links;
    // Separate audio/subtitle tracks need coordinated timeline edits.
    if (/^#EXT-X-MEDIA:.*\bURI=/m.test(body)) throw new SourceError(502, 'Giữ nguyên danh sách có track riêng.');
    const add = uri => {
      const target = secureUrl(new URL(uri, url).href);
      if (!target || !/\.m3u8$/i.test(new URL(target).pathname)) throw new SourceError(502, 'Danh sách chất lượng không hợp lệ.');
      if (!links.includes(target)) links.push(target);
      if (links.length > 32) throw new SourceError(502, 'Danh sách chất lượng vượt giới hạn.');
    };
    for (const raw of body.split(/\r?\n/)) {
      const line = raw.trim();
      if (line && !line.startsWith('#')) add(line);
      else for (const match of line.matchAll(/URI="([^"]+)"/g)) add(match[1]);
    }
    return links;
  }
  async function filteredStream(hash, indices, isIndex) {
    const data = await resolve(hash), base = origin + '/source/stream/' + hash;
    if (!filterableHost(data.url) || data.subtitles.length) {
      if (!isIndex) throw new SourceError(404, 'Không có danh sách phát này.');
      return null;
    }
    let url = data.url, result;
    for (let depth = 0; depth <= indices.length; depth++) {
      // If a CDN rejects a server-side read, preserve the original device path.
      try { result = await playlist(url); } catch (error) {
        console.warn('Optional HLS filter read failed', JSON.stringify({ host: new URL(url).hostname, status: error.upstreamStatus || null, error: error.name }));
        if (depth !== indices.length) throw new SourceError(502, 'Chưa tải được danh sách chất lượng.');
        return { redirect: url };
      }
      if (depth === indices.length) break;
      const links = playlistLinks(result.body, result.url);
      url = links[indices[depth]];
      if (!url) throw new SourceError(404, 'Không có danh sách chất lượng này.');
    }
    if (!ordinaryPlaylist(result.body)) return { redirect: result.url };
    let links;
    try { links = playlistLinks(result.body, result.url); }
    catch (error) {
      console.warn('Optional HLS filter metadata fallback', JSON.stringify({ host: new URL(url).hostname, error: error.message }));
      return { redirect: result.url };
    }
    if (links.length && indices.length >= 3) return { redirect: result.url };
    const filtered = filterAds(result.body, result.url);
    if (!links.length && !filtered.removed) {
      console.info('Optional HLS filter unchanged', JSON.stringify({ host: new URL(url).hostname, bytes: result.body.length, finite: result.body.includes('#EXT-X-ENDLIST') }));
      return { redirect: result.url };
    }
    let body = absolutePlaylist(filtered.body, result.url);
    const childUrl = i => base + '/playlist-' + [...indices, i].join('-') + '.m3u8';
    if (links.length) {
      // Children are selected by bounded indices into the provider's manifest.
      // No caller-supplied URL is accepted or proxied; media bytes stay on CDN.
      body = body.split('\n').map(line => {
        if (line && !line.startsWith('#')) return childUrl(links.indexOf(line));
        return line.replace(/URI="([^"]+)"/g, (_, uri) => 'URI="' + childUrl(links.indexOf(uri)) + '"');
      }).join('\n');
    }
    return { hls: body };
  }
  async function detail(slug, audio = '') {
    if (audio && !['lt', 'tm'].includes(audio)) throw new SourceError(400, 'Âm thanh không hợp lệ.');
    if (!slug.startsWith(PREFIX)) throw new SourceError(410, 'Nguồn cũ đã ngừng dùng. Tìm lại phim trên Tủ Phim.');
    const upstream = slug.slice(PREFIX.length);
    if (!SLUG.test(upstream)) throw new SourceError(400, 'Phim không hợp lệ.');
    // Episode availability changes independently of the catalogue metadata.
    const data = await json('/movies/' + upstream, 15000);
    if (data.movie?.vipOnly) throw new SourceError(403, 'Phim này cần quyền truy cập tại nhà cung cấp.');
    const normalized = movie(data.movie, data);
    if (!normalized || normalized.slug !== slug) throw new SourceError(404, 'Không tìm thấy phim tại Tủ Phim.');
    const sources = (data.watchSources || []).filter(s => s.hasEpisodes);
    if (sources.length > 16 || sources.reduce((sum, s) => sum + (Number(s.episodeCount) || 0), 0) > 10000) throw new SourceError(502, 'Danh sách tập vượt giới hạn hỗ trợ.');
    const episodes = await Promise.all(sources.map(async source => {
      let rows = Array.isArray(source.episodes) ? source.episodes.slice() : [];
      const pages = positive(source.episodePagination?.totalPages, 1, 100);
      // Never silently omit later episodes in long series.
      for (let p = 2; p <= pages; p++) {
        const sourceIndex = positive(Number(source.sourceIndex) + 1, 1, 100) - 1;
        const extra = await json('/movies/' + upstream + '/episodes?sourceIndex=' + sourceIndex + '&page=' + p + '&limit=100', 15000);
        rows.push(...(extra.episodes || []));
      }
      if (rows.length > 10000) throw new SourceError(502, 'Danh sách tập vượt giới hạn.');
      const seen = new Set();
      return { server_name: String(source.nickname || source.nicknameShort || 'Tủ Phim'), server_data: rows.filter(e => HASH.test(e.hash || '') && !seen.has(e.hash) && seen.add(e.hash)).map((e, i) => ({
        name: String(e.name || i + 1), slug: String(e.slug || 'tap-' + (i + 1)), filename: String(e.name || i + 1),
        link_m3u8: e.useMedia === true ? origin + '/source/stream/' + e.hash + '/index.m3u8' : '',
        // Public provider player is the supported web fallback when its CDN
        // declines direct third-party playback. Do not spoof request identity.
        link_embed: e.useMedia === true ? API + '/embed/' + e.hash : ''
      })) };
    }));
    for (const server of episodes) server.server_data = server.server_data.filter(e => e.link_m3u8);
    const playable = episodes.filter(s => s.server_data.length);
    const matchesAudio = server => {
      const name = server.server_name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      return audio === 'lt' ? /\[\s*lt\s*\]|long\s*tieng/.test(name) : audio === 'tm' && /\[\s*tm\s*\]|thuyet\s*minh/.test(name);
    };
    // Prefer the public HLS family verified with native seeking; keep every choice.
    playable.sort((a, b) => Number(matchesAudio(b)) - Number(matchesAudio(a)) || Number(/^Diamond\b/i.test(b.server_name)) - Number(/^Diamond\b/i.test(a.server_name)) || b.server_data.length - a.server_data.length);
    if (audio) {
      normalized.audio_preference = audio;
      if (!playable.some(matchesAudio)) normalized.audio_notice = 'Chưa thấy server ghi nhãn ' + (audio === 'lt' ? 'Lồng tiếng' : 'Thuyết minh') + ' trong nguồn phát hiện tại. Bạn có thể chọn server khác.';
    }
    return { status: true, source: 'tuphim', audio: audio || undefined, movie: normalized, episodes: playable };
  }
  async function list(path, query) {
    const params = new URLSearchParams({ page: String(positive(query.get('page'), 1, 100000)), limit: String(positive(query.get('limit'), 24, 60)) });
    const clean = path.replace(/^v1\/api\//, '');
    let audioKey = '';
    if (clean === 'tim-kiem') {
      const keyword = (query.get('keyword') || '').trim();
      if (!keyword || keyword.length > 200) throw new SourceError(400, 'Từ khóa không hợp lệ.');
      params.set('search', keyword);
    } else if (/^(the-loai|quoc-gia)\/[a-z0-9-]+$/.test(clean)) {
      const [type, slug] = clean.split('/'); params.set(type === 'the-loai' ? 'category' : 'country', slug);
    } else {
      const category = clean.replace(/^danh-sach\//, '');
      const audioCategories = { 'phim-long-tieng': 'lt', 'phim-thuyet-minh': 'tm' };
      const types = { 'phim-bo': 'series', 'phim-le': 'single,movie', 'tv-shows': 'tvshows', 'hoat-hinh': 'hoathinh' };
      if (audioCategories[category]) { audioKey = audioCategories[category]; params.set('langKeys', audioKey); }
      else if (types[category]) params.set('type', types[category]);
      else if (category === 'phim-chieu-rap') params.set('chieurap', 'true');
      else if (!['phim-moi', 'phim-moi-cap-nhat'].includes(category)) throw new SourceError(404, 'Danh mục không được hỗ trợ.');
    }
    const data = await json('/movies?' + params);
    if (audioKey && (data.items || []).some(item => !item.vipOnly && (!Array.isArray(item.langKeys) || !item.langKeys.includes(audioKey)))) throw new SourceError(502, 'Nguồn phim chưa trả đúng bộ lọc âm thanh. Vui lòng thử lại.');
    const items = (data.items || []).map(x => movie(x)).filter(Boolean).map(item => audioKey ? { ...item, audio_preference: audioKey } : item);
    const pagination = { currentPage: Number(data.page) || 1, totalPages: Number(data.totalPages) || 1, totalItems: Number(data.total) || 0, totalItemsPerPage: Number(data.limit) || +params.get('limit') };
    return { status: true, source: 'tuphim', audio: audioKey || undefined, items, pagination, data: { items, params: { pagination } } };
  }
  return async function route(path, query = new URLSearchParams()) {
    path = String(path || '').replace(/^\/+|\/+$/g, '');
    if (path.length > 512 || /[\\\x00-\x20]/.test(path)) throw new SourceError(400, 'Đường dẫn không hợp lệ.');
    if (path.startsWith('phim/')) return { json: await detail(path.slice(5), query.get('audio') || '') };
    const stream = /^stream\/([a-zA-Z0-9_-]+)\/(index|subtitle-\d+|playlist(?:-\d{1,2}){1,3})\.m3u8$/.exec(path);
    if (stream) {
      const data = await resolve(stream[1]), base = origin + '/source/stream/' + stream[1];
      if (stream[2].startsWith('playlist')) {
        const indices = stream[2].split('-').slice(1).map(Number);
        if (indices.some(i => i > 31)) throw new SourceError(404, 'Không có danh sách chất lượng này.');
        return filteredStream(stream[1], indices, false);
      }
      if (stream[2] !== 'index') {
        const track = data.subtitles[+stream[2].slice(9)];
        if (!track) throw new SourceError(404, 'Không có phụ đề này.');
        return { hls: '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:86400\n#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXTINF:86400.000,\n' + track.url + '\n#EXT-X-ENDLIST\n' };
      }
      const filtered = await filteredStream(stream[1], [], true);
      if (filtered) return filtered;
      // Let the viewer request unmodified streams directly. Some public CDNs
      // serve devices but return404 to a serverless data-centre fetch.
      if (!data.subtitles.length) return { redirect: data.url };
      const result = await cached('manifest:' + stream[1], 15000, () => read(data.url, { media: true, maxBytes: 1024 * 1024 }));
      return { hls: withSubtitles(result.body, result.url, data.subtitles, base) };
    }
    return { json: await list(path, query) };
  };
}
module.exports = { createSource, SourceError, movie, publicEpisode, withSubtitles, secureUrl, isPrivate };
