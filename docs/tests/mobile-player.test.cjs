'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../mobile-player.js'), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));

function setup({ native = true, agent = 'iPhone Safari', rejectPlay, scriptSource } = {}) {
  const listeners = new Map(), timers = new Map(), scripts = [], instances = [], calls = [];
  let timerId = 0, ranges = [], position = 0;
  const video = {
    muted: true, readyState: 0, duration: NaN, paused: true, ended: false, seeking: false, error: null,
    playCalls: 0, loads: 0, assignments: [],
    canPlayType: () => native ? 'maybe' : '',
    pause() { this.paused = true; },
    load() { this.loads++; this.readyState = 0; this.error = null; position = 0; ranges = []; },
    play() { this.playCalls++; this.paused = false; return rejectPlay ? rejectPlay() : Promise.resolve(); },
    removeAttribute(name) { delete this[name]; },
    addEventListener(event, callback) { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(callback); },
    removeEventListener(event, callback) { listeners.get(event)?.delete(callback); },
    get currentTime() { return position; },
    set currentTime(value) { this.assignments.push(value); if (this.readyState < 1) throw new Error('metadata not ready'); position = value; },
    get seekable() { return { length: ranges.length, start: i => ranges[i][0], end: i => ranges[i][1] }; }
  };
  const context = {
    navigator: { userAgent: agent },
    document: { hidden: false, currentScript: scriptSource ? { src: scriptSource } : null, createElement: () => ({ remove() {} }), head: { appendChild(script) { scripts.push(script); } } },
    setTimeout(callback) { timers.set(++timerId, callback); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    MediaSource: {}, console, URL
  };
  context.window = context;
  vm.runInNewContext(source, context);
  const player = new context.KhoMobilePlayer(video, Object.fromEntries(['onError', 'onTapRequired', 'onRecover', 'onBeforeError'].map(name => [name, () => calls.push(name)])));
  function emit(event) { for (const callback of [...(listeners.get(event) || [])]) callback(); }
  function ready(duration = 120, seekable = [[0, duration]]) { video.readyState = 4; video.duration = duration; ranges = seekable; }
  function expire() { const pending = [...timers.values()]; timers.clear(); pending.forEach(callback => callback()); }
  function installHls(supported = true) {
    class Hls {
      static isSupported() { return supported; }
      static Events = { MEDIA_ATTACHED: 'attached', MANIFEST_PARSED: 'manifest', ERROR: 'error' };
      static ErrorTypes = { NETWORK_ERROR: 'network', MEDIA_ERROR: 'media' };
      constructor(config) { this.config = config; this.handlers = {}; this.network = 0; this.media = 0; instances.push(this); }
      on(event, callback) { this.handlers[event] = callback; }
      attachMedia() { this.handlers.attached(); }
      loadSource(url) { this.url = url; }
      destroy() { this.destroyed = true; }
      startLoad() { this.network++; }
      recoverMediaError() { this.media++; }
    }
    context.Hls = Hls;
    return Hls;
  }
  return { context, player, video, timers, scripts, instances, calls, emit, ready, expire, installHls };
}

test('Safari starts native playback within the tap, unmutes on reopen, and never downloads HLS.js', () => {
  const s = setup();
  s.player.open('https://video.test/one.m3u8');
  assert.equal(s.video.playCalls, 1);
  assert.equal(s.video.muted, false);
  assert.equal(s.scripts.length, 0);
  s.player.stop(); s.player.open('https://video.test/two.m3u8');
  assert.equal(s.video.muted, false);
});

test('Safari resume waits for seekable ranges after metadata and clamps an expired history position', () => {
  const s = setup(); s.player.open('one.m3u8', 400);
  s.video.readyState = 1; s.video.duration = 100; s.emit('loadedmetadata');
  assert.deepEqual(s.video.assignments, []);
  s.ready(100); s.emit('progress');
  assert.equal(s.video.currentTime, 99.75);
  s.emit('canplay'); assert.equal(s.video.assignments.length, 1);
});

test('10 second skips queue before metadata, accumulate, and stay inside the seekable window', () => {
  const s = setup(); s.player.open('one.m3u8');
  assert.equal(s.player.seekBy(10), false); s.player.seekBy(10);
  assert.deepEqual(s.video.assignments, []);
  s.ready(); s.emit('canplay'); assert.equal(s.video.currentTime, 20);
  s.player.seekBy(-100); assert.equal(s.video.currentTime, 0);
  s.player.seekBy(1000); assert.equal(s.video.currentTime, 119.75);
  s.ready(120, [[20, 50], [60, 100]]); s.player.seekBy(-65);
  assert.ok(s.video.currentTime >= 20 && s.video.currentTime < 50);
});

test('closing or switching episodes cancels old metadata and all recovery timers', () => {
  const s = setup(); s.player.open('old.m3u8', 80); s.player.stop();
  s.ready(); s.emit('loadedmetadata'); s.expire();
  assert.deepEqual(s.video.assignments, []); assert.equal(s.timers.size, 0);
  s.player.open('new.m3u8', 10); s.ready(); s.emit('loadedmetadata');
  assert.equal(s.video.currentTime, 10);
});

test('autoplay blocking asks for a tap without reloading or switching sources', async () => {
  const s = setup({ rejectPlay: () => Promise.reject({ name: 'NotAllowedError' }) });
  s.player.open('one.m3u8'); const loads = s.video.loads; await flush(); s.expire();
  assert.deepEqual(s.calls, ['onTapRequired']); assert.equal(s.video.loads, loads);
  assert.equal(s.scripts.length, 0);
});

test('late play rejection cannot restart a closed player', async () => {
  let reject;
  const s = setup({ rejectPlay: () => new Promise((_, r) => { reject = r; }) });
  s.player.open('old.m3u8'); s.player.stop(); reject({ name: 'NotSupportedError' }); await flush();
  assert.deepEqual(s.calls, []); assert.equal(s.scripts.length, 0);
});

test('a stalled native seek reloads once at its target, then tries MSE, with bounded failures', async () => {
  const s = setup(); s.player.open('one.m3u8'); s.ready(); s.video.currentTime = 45;
  s.emit('seeking'); s.expire(); s.ready(); s.emit('progress');
  assert.equal(s.video.currentTime, 45);
  s.video.error = { code: 3 }; s.emit('error');
  assert.equal(s.scripts.length, 1);
  s.installHls(); s.scripts[0].onload(); await flush();
  assert.equal(s.instances[0].config.startPosition, 45);
  assert.equal(s.video.disableRemotePlayback, true);
  s.instances[0].handlers.error(null, { fatal: true, type: 'other' });
  assert.deepEqual(s.calls.slice(-2), ['onBeforeError', 'onError']);
  assert.equal(s.instances[0].destroyed, true);
});

test('ordinary buffering, user pause and backgrounding do not prematurely replace a source', () => {
  const s = setup(); s.player.open('one.m3u8'); s.ready(); s.emit('waiting'); s.emit('playing');
  assert.equal(s.timers.size, 0);
  s.emit('waiting'); s.video.paused = true; s.emit('pause'); s.expire();
  assert.deepEqual(s.calls, []);
  s.video.paused = false; s.context.document.hidden = true; s.emit('waiting'); s.expire();
  assert.deepEqual(s.calls, []); assert.equal(s.timers.size, 1);
});

test('HLS download is shared and opening a new episode while it loads only attaches the new one', async () => {
  const s = setup({ native: false }); s.player.open('old.m3u8'); s.player.open('new.m3u8');
  assert.equal(s.scripts.length, 1); s.installHls(); s.scripts[0].onload(); await flush();
  assert.equal(s.instances.length, 1); assert.equal(s.instances[0].url, 'new.m3u8');
});

test('closing during HLS download cannot attach a decoder later', async () => {
  const s = setup({ native: false }); s.player.open('one.m3u8'); s.player.stop();
  s.installHls(); s.scripts[0].onload(); await flush(); assert.equal(s.instances.length, 0);
});

test('fatal HLS network and media retries are bounded and old errors cannot affect a new episode', async () => {
  const s = setup({ native: false }); s.installHls(); s.player.open('one.m3u8'); await flush();
  const old = s.instances[0];
  old.handlers.error(null, { fatal: true, type: 'network' });
  old.handlers.error(null, { fatal: true, type: 'media' });
  assert.equal(old.network, 1); assert.equal(old.media, 1);
  old.handlers.error(null, { fatal: true, type: 'media' }); assert.equal(s.calls.filter(x => x === 'onError').length, 1);
  s.player.open('new.m3u8'); await flush(); old.handlers.error(null, { fatal: true, type: 'network' });
  assert.equal(s.calls.filter(x => x === 'onError').length, 1);
});

test('a failed lazy library download reports an error and can be retried', async () => {
  const s = setup({ native: false }); s.player.open('one.m3u8'); s.scripts[0].onerror(); await flush();
  assert.equal(s.calls.filter(x => x === 'onError').length, 1);
  s.player.open('two.m3u8'); assert.equal(s.scripts.length, 2);
});

test('desktop resolves the local pinned decoder from the shared script URL', () => {
  const s = setup({ native: false, scriptSource: 'https://example.test/mobile-player.js?v=1' });
  assert.equal(s.context.KhoVideoPlayer, s.context.KhoMobilePlayer);
  s.player.open('one.m3u8');
  assert.equal(s.scripts[0].src, 'https://example.test/tv/vendor/hls.light-1.7.3.min.js');
});

test('paused restore seeks after readiness without autoplay or unmuting (native and MSE)', async () => {
  for (const native of [true, false]) {
    const s = setup({ native }); s.installHls();
    s.player.open('one.m3u8', 65, { autoplay: false, unmute: false });
    await flush();
    if (!native) s.instances[0].handlers.manifest();
    s.ready(120); s.emit('progress');
    assert.equal(s.video.currentTime, 65);
    assert.equal(s.video.playCalls, 0); assert.equal(s.video.paused, true); assert.equal(s.video.muted, true);
    s.player.seekTo(95); assert.equal(s.video.currentTime, 95); assert.equal(s.video.paused, true);
  }
});

test('native recovery preserves an intentional pause', () => {
  const s = setup(); s.player.open('one.m3u8'); s.ready(); s.video.currentTime = 40;
  s.video.paused = true; s.emit('pause');
  s.video.error = { code: 3 }; s.emit('error'); s.ready(); s.emit('progress');
  assert.equal(s.video.currentTime, 40); assert.equal(s.video.playCalls, 1); assert.equal(s.video.paused, true);
});
