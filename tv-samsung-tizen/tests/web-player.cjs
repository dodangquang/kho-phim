'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function setup(native) {
  const scripts = [];
  const instances = [];
  const errors = [];
  const timers = new Map(); let sequence = 0;
  const video = { canPlayType: () => native ? 'probably' : '', pause() {}, load() {}, play() { return { catch() {} }; }, removeAttribute(name) { delete this[name]; }, duration: 100, currentTime: 0 };
  const context = {
    document: { getElementById: () => video, createElement: () => ({}), head: { appendChild(script) { scripts.push(script); } } },
    KhoCore: { safeUrl: url => /^https?:\/\//.test(url), time: String },
    setTimeout(callback) { const id = ++sequence; timers.set(id, callback); return id; }, clearTimeout(id) { timers.delete(id); }
  };
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
  return { context, player, scripts, instances, errors, video, installHls };
}
module.exports = function () {
  const checks = [];
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
  return checks;
};
if (require.main === module) module.exports().forEach(name => console.log('PASS ' + name));
