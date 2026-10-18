'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function setup(native, agent) {
  const scripts = [];
  const instances = [];
  const errors = [];
  const timers = new Map(); let sequence = 0;
  const video = { canPlayType: () => native ? 'probably' : '', pause() { this.pauseCount = (this.pauseCount || 0) + 1; }, load() {}, play() { this.playCount = (this.playCount || 0) + 1; return { catch() {} }; }, removeAttribute(name) { delete this[name]; }, duration: 100, currentTime: 0, seekable: { length: 0 } };
  const context = {
    document: { getElementById: () => video, createElement: () => ({}), head: { appendChild(script) { scripts.push(script); } } },
    KhoCore: { safeUrl: url => /^https?:\/\//.test(url), time: String },
    setTimeout(callback, delay) { const id = ++sequence; timers.set(id, { callback, delay }); return id; }, clearTimeout(id) { timers.delete(id); }
  };
  if (agent) { context.navigator = { userAgent: agent }; context.MediaSource = { isTypeSupported: () => true }; }
  context.window = context;
  const web = path.resolve(__dirname, '../../docs/tv');
  vm.createContext(context);
  for (const name of ['player.js','hls-loader.js']) vm.runInContext(fs.readFileSync(path.join(web, name), 'utf8'), context);
  function installHls(supported = true) {
    function Hls(config) { this.config = config; this.handlers = {}; instances.push(this); }
    Hls.isSupported = () => supported;
    Hls.Events = { MEDIA_ATTACHED: 'attached', ERROR: 'error' };
    Hls.prototype.on = function (event, callback) { this.handlers[event] = callback; };
    Hls.prototype.attachMedia = function (media) { this.media = media; this.handlers.attached(); };
    Hls.prototype.loadSource = function (url) { this.url = url; };
    Hls.prototype.destroy = function () { this.destroyed = true; };
    context.Hls = Hls;
  }
  const player = new context.KhoPlayer({ error: message => errors.push(message), message() {}, state() {}, time() {} });
  function fire(delay) {
    const entry = [...timers.entries()].find(([, item]) => item.delay === delay);
    assert.ok(entry, 'Expected pending ' + delay + 'ms timer');
    timers.delete(entry[0]); entry[1].callback();
  }
  return { context, player, scripts, instances, errors, video, installHls, timers, fire };
}
module.exports = function () {
  const checks = [];
  {
    const { player, scripts, video, installHls, instances } = setup(true, 'Mozilla/5.0 Windows NT 10.0 Chrome/154.0 Safari/537.36 Edg/154.0');
    player.open('https://media.example/edge-maybe.m3u8', 0);
    assert.equal(scripts.length, 1, 'Desktop must select MSE even when native canPlayType claims support');
    assert.equal(video.src, undefined);
    installHls(); scripts[0].onload(); assert.equal(instances[0].url, 'https://media.example/edge-maybe.m3u8');
    checks.push('Desktop Edge selects HLS.js despite a positive native canPlayType response');
  }
  {
    const { player, scripts, video, installHls, instances, errors } = setup(true, 'Mozilla/5.0 SMART-TV Tizen 5.5 Chrome/69.0 Safari/537.36');
    player.open('https://media.example/tizen-native.m3u8', 0);
    assert.equal(scripts.length, 0); assert.equal(video.src, 'https://media.example/tizen-native.m3u8');
    video.onerror(); assert.equal(scripts.length, 1); assert.equal(errors.length, 0);
    installHls(); scripts[0].onload(); assert.equal(instances.length, 1);
    instances[0].handlers.error(null, { fatal: true });
    assert.equal(player.state, 'error'); assert.equal(errors.length, 1); assert.equal(scripts.length, 1);
    checks.push('TV keeps native HLS first and switches once to MSE on native failure without retry loops');
  }
  {
    const { player, scripts, video } = setup(true, 'Mozilla/5.0 Macintosh AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15');
    player.open('https://media.example/safari.m3u8', 0);
    assert.equal(scripts.length, 0); assert.equal(video.src, 'https://media.example/safari.m3u8');
    checks.push('Safari retains native HLS even when MediaSource is available');
  }
  {
    const { player, scripts, video } = setup(true);
    assert.equal(scripts.length, 0);
    player.open('https://media.example/native.m3u8', 10000);
    assert.equal(scripts.length, 0);
    assert.equal(video.src, 'https://media.example/native.m3u8');
    video.onloadedmetadata(); video.onplaying(); assert.equal(player.state, 'playing');
    player.stop(); assert.equal(video.src, undefined);
    checks.push('Native web HLS starts without requesting HLS.js and releases video on stop');
  }
  {
    const { player, scripts, instances, installHls, video } = setup(false);
    assert.equal(scripts.length, 0);
    player.open('https://media.example/old.m3u8', 0);
    player.open('https://media.example/new.m3u8', 0);
    assert.equal(scripts.length, 1);
    installHls(); scripts[0].onload();
    assert.equal(instances.length, 1); assert.equal(instances[0].url, 'https://media.example/new.m3u8');
    video.onloadedmetadata(); video.onplaying(); assert.equal(player.state, 'playing');
    player.stop(); assert.equal(instances[0].destroyed, true);
    instances[0].handlers.error(null, { fatal: true }); assert.equal(player.state, 'closed');
    checks.push('Web HLS lazy load is shared; stale opens cannot start playback and stop destroys the decoder');
  }
  {
    const { player, scripts, instances, installHls } = setup(false);
    player.open('https://media.example/one.m3u8', 0); player.stop();
    installHls(); scripts[0].onload(); assert.equal(instances.length, 0);
    checks.push('Leaving playback while HLS.js loads cannot restart video');
  }
  {
    const { player, scripts, errors, instances, installHls } = setup(false);
    player.open('https://media.example/error.m3u8', 0); installHls(); scripts[0].onload();
    instances[0].handlers.error(null, { fatal: true });
    assert.equal(player.state, 'error'); assert.equal(instances[0].destroyed, true); assert.equal(errors.length, 1);
    checks.push('Fatal HLS errors close the decoder and show a navigable source error');
  }
  {
    const { player, video, errors } = setup(true);
    let currentTime = 0;
    Object.defineProperty(video, 'currentTime', {
      get() { return currentTime; },
      set(value) { if (!video.seekable.length) throw new Error('Native HLS is not seekable yet'); currentTime = value; }
    });
    player.open('https://media.example/resume.m3u8', 30000);
    video.onloadedmetadata();
    assert.equal(video.playCount, 1); assert.equal(currentTime, 0); assert.equal(errors.length, 0);
    video.seekable = { length: 1, start: () => 0, end: () => 100 };
    video.oncanplay();
    assert.equal(currentTime, 30); assert.equal(player.position, 30000); assert.equal(player.videoSeekTarget, null);
    checks.push('Native resume waits for seekable ranges and cannot prevent initial playback');
  }
  {
    const { player, video, timers, fire } = setup(true);
    player.open('https://media.example/skip.m3u8', 0); video.onloadedmetadata(); video.onplaying();
    player.setPaused(true);
    video.onwaiting(); assert.equal(timers.size, 0);
    player.seek(10000); fire(180);
    player.seek(10000); fire(180);
    assert.equal(player.videoSeekTarget, 20000); assert.equal(video.currentTime, 0);
    video.seekable = { length: 1, start: () => 0, end: () => 100 };
    video.onprogress();
    assert.equal(video.currentTime, 20); assert.equal(player.state, 'paused'); assert.equal(timers.size, 0);
    const before = video.pauseCount; video.onplaying();
    assert.equal(player.state, 'paused'); assert.equal(video.pauseCount, before + 1);
    player.setPaused(false); assert.equal(player.state, 'playing'); assert.equal(timers.size, 1);
    checks.push('Paused web buffering stays paused; delayed skips accumulate and resume restores timeout');
  }
  {
    const { player, video } = setup(true);
    player.open('https://media.example/old-resume.m3u8', 50000);
    const oldReady = video.oncanplay;
    player.open('https://media.example/new-resume.m3u8', 0);
    video.seekable = { length: 1, start: () => 0, end: () => 100 };
    oldReady();
    assert.equal(video.currentTime, 0); assert.equal(player.videoSeekTarget, null);
    player.stop();
    assert.equal(video.oncanplay, null); assert.equal(video.onprogress, null); assert.equal(video.ondurationchange, null);
    checks.push('Obsolete native readiness callbacks cannot seek a new episode and stop removes all handlers');
  }
  {
    const { player, video, scripts, instances, installHls } = setup(true, 'Mozilla/5.0 SMART-TV Tizen 5.5 Chrome/69.0 Safari/537.36');
    player.open('https://media.example/native-late-error.m3u8', 10000);
    video.seekable = { length: 1, start: () => 0, end: () => 100 };
    video.onloadedmetadata(); video.onplaying();
    video.currentTime = 45; video.ontimeupdate(); player.setPaused(true);
    video.onerror();
    installHls(); scripts[0].onload();
    assert.equal(instances.length, 1);
    const before = video.playCount; video.currentTime = 0; video.onloadedmetadata();
    assert.equal(video.currentTime, 45); assert.equal(video.playCount, before); assert.equal(player.state, 'paused');
    checks.push('Native-to-HLS fallback retains the current position and pause state');
  }
  return checks;
};
if (require.main === module) module.exports().forEach(name => console.log('PASS ' + name));
