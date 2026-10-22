'use strict';

// These two standalone clips are also excluded by the public provider player.
// Match a complete path component, never a generic filename or discontinuity.
const AD_CLIPS = new Set(['18d007379882ef14b73445b93bf6168d', 'd61a03b1dabe537cc05ffe5c9c280f56']);
function isAdClip(uri, base) {
  try { return new URL(uri, base).pathname.split('/').some(part => AD_CLIPS.has(part.toLowerCase())); }
  catch (_) { return false; }
}
function ordinaryPlaylist(body) {
  return body.trimStart().startsWith('#EXTM3U') &&
    !/^#EXT-X-(?:SESSION-)?KEY:.*METHOD=(?!NONE(?:,|$))/m.test(body);
}
function filterAds(body, base) {
  // Only finite, unencrypted TS playlists can be shortened safely here.
  if (!ordinaryPlaylist(body) || !/^#EXT-X-ENDLIST\s*$/m.test(body) ||
      /^#EXT-X-(?:MAP|BYTERANGE|PART|SKIP|PROGRAM-DATE-TIME|DATERANGE):/m.test(body)) return { body, removed: 0, seconds: 0 };
  const output = []; let pending = [], duration = 0, removed = 0, seconds = 0, kept = 0;
  for (const line of body.split(/\r?\n/)) {
    const value = line.trim();
    if (value.startsWith('#EXTINF:')) {
      if (pending.length) return { body, removed: 0, seconds: 0 };
      duration = Number.parseFloat(value.slice(8));
      if (!Number.isFinite(duration) || duration <= 0) return { body, removed: 0, seconds: 0 };
      pending.push(line);
    } else if (value && !value.startsWith('#')) {
      if (pending.length && isAdClip(value, base)) { removed++; seconds += duration; }
      else { output.push(...pending, line); kept++; }
      pending = []; duration = 0;
    } else if (pending.length) pending.push(line);
    else output.push(line);
  }
  if (pending.length || !removed || !kept) return { body, removed: 0, seconds: 0 };
  // Keep one timestamp reset at the join between the two film fragments.
  const joined = [];
  for (const line of output) {
    if (line.trim() === '#EXT-X-DISCONTINUITY' && joined.at(-1)?.trim() === '#EXT-X-DISCONTINUITY') continue;
    joined.push(line);
  }
  return { body: joined.join('\n'), removed, seconds };
}
function filterableHost(url) {
  const host = new URL(url).hostname;
  return /^(?:[a-z0-9-]+\.)?(?:phim1280\.tv|kkphimplayer6\.com|kvp726\.com)$/.test(host);
}
module.exports = { filterAds, ordinaryPlaylist, filterableHost };
