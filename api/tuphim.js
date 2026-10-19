'use strict';
const { createSource, SourceError } = require('../lib/tuphim');
const route = createSource();
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (!['GET', 'HEAD'].includes(req.method)) { res.statusCode = 405; res.setHeader('Allow', 'GET, HEAD, OPTIONS'); return res.end(); }
  try {
    const url = new URL(req.url, 'https://khophimqd.vercel.app');
    const path = req.query?.path || url.searchParams.get('path') || url.pathname.replace(/^\/source\//, '');
    if (Array.isArray(path)) throw new SourceError(400, 'Đường dẫn không hợp lệ.');
    const result = await route(path, url.searchParams);
    if (result.redirect) {
      res.statusCode = 302;
      res.setHeader('Location', result.redirect);
      res.setHeader('Cache-Control', 'no-store');
      return res.end();
    }
    // Do not add browser/CDN cache time on top of the short episode cache.
    res.setHeader('Cache-Control', result.hls || result.json?.movie ? 'no-store' : 'public, max-age=30, s-maxage=60');
    res.setHeader('Content-Type', result.hls ? 'application/vnd.apple.mpegurl; charset=utf-8' : 'application/json; charset=utf-8');
    res.statusCode = 200;
    return res.end(req.method === 'HEAD' ? '' : result.hls || JSON.stringify(result.json));
  } catch (error) {
    res.statusCode = error instanceof SourceError ? error.status : 502;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(req.method === 'HEAD' ? '' : JSON.stringify({ status: false, source: 'tuphim', message: error instanceof SourceError ? error.message : 'Không kết nối được Tủ Phim. Vui lòng thử lại hoặc đổi server.' }));
  }
};
