'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function setup(source) {
  let sequence = 0;
  const timers = new Map();
  const events = [];
  const seeks = [];
  let listener;
  const av = {
    open() {}, setDisplayRect() {}, setListener(value) { listener = value; }, setDisplayMethod() {},
    prepareAsync(success) { success(); }, getDuration() { return 3600000; },
    play() { events.push('play'); }, pause() {}, stop() {}, close() { events.push('close'); },
    seekTo(target, success, failure) { seeks.push({ target, success, failure }); }
  };
  const platform = {
    document: { getElementById() { return { className: 'hidden' }; } },
    KhoCore: { safeUrl(url) { return url; }, time: String }, webapis: { avplay: av },
    setTimeout(callback, delay) { const id = ++sequence; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    Date
  };
  platform.window = platform;
  vm.runInNewContext(fs.readFileSync(source, 'utf8'), platform);
  const player = new platform.KhoPlayer({ message() {}, time() {}, state() {}, error() { events.push('error'); } });
  function fire(delay) {
    const entry = [...timers.entries()].find(([, item]) => item.delay === delay);
    assert.ok(entry, 'Expected pending ' + delay + 'ms timer');
    timers.delete(entry[0]); entry[1].callback();
  }
  return { player, timers, events, seeks, fire, listener: () => listener };
}
module.exports = function () {
  const checks = [];
  for (const [name, source] of [
    ['Samsung', path.join(__dirname, '..', 'player.js')],
    ['TV Web AVPlay', path.join(__dirname, '../../docs/tv/player.js')]
  ]) {
    {
      const { player, timers, events, fire } = setup(source);
      player.open('https://example.test/video.m3u8', 0);
      assert.equal(player.state, 'playing'); assert.equal(timers.size, 1);
      const first = [...timers.keys()][0];
      player.tick(1000, true);
      assert.equal(timers.size, 1); assert.equal(timers.has(first), false);
      player.setPaused(true); assert.equal(timers.size, 0);
      player.setPaused(false); assert.equal(timers.size, 1);
      fire(25000);
      assert.equal(player.state, 'error'); assert.equal(timers.size, 0);
      assert.equal(events.filter(item => item === 'error').length, 1);
      assert.equal(events.filter(item => item === 'close').length, 1);
      checks.push(name + ': progress refreshes timeout; pause clears it; resumed stalls fail once');
    }
    {
      const { player, timers, events, listener } = setup(source);
      player.open('https://example.test/paused.m3u8', 0);
      const overdue = [...timers.values()][0].callback;
      player.setPaused(true);
      listener().onbufferingstart(); listener().onbufferingcomplete();
      assert.equal(timers.size, 0, 'Paused buffering must never arm the 25s watchdog');
      overdue();
      assert.equal(player.state, 'paused'); assert.equal(events.includes('error'), false);
      player.setPaused(false); assert.equal(timers.size, 1);
      checks.push(name + ': buffering and an already queued timeout cannot fail paused playback');
    }
    {
      const { player, timers, seeks, listener, fire } = setup(source);
      player.open('https://example.test/seek-paused.m3u8', 0);
      player.tick(30000, true); player.setPaused(true);
      player.seek(10000); fire(180);
      assert.equal(seeks[0].target, 40000);
      listener().onbufferingstart(); listener().onbufferingcomplete(); seeks[0].success();
      assert.equal(player.state, 'paused'); assert.equal(player.position, 40000); assert.equal(timers.size, 0);
      player.setPaused(false); assert.equal(timers.size, 1);
      checks.push(name + ': seeking while paused preserves pause and resume restores stall detection');
    }
    {
      const { player, timers, events, listener } = setup(source);
      player.open('https://example.test/old.m3u8', 0);
      const oldToken = player.token;
      const oldListener = listener();
      const oldTimeout = [...timers.values()][0].callback;
      player.open('https://example.test/new.m3u8', 0);
      const currentTimer = [...timers.keys()][0];
      player.armWatchdog(oldToken); oldListener.onbufferingstart(); oldListener.onbufferingcomplete(); oldTimeout();
      assert.equal(player.state, 'playing'); assert.equal(timers.has(currentTimer), true); assert.equal(timers.size, 1);
      player.stop(); player.armWatchdog(player.token); assert.equal(timers.size, 0);
      player.state = 'error'; player.armWatchdog(player.token); assert.equal(timers.size, 0);
      assert.equal(events.includes('error'), false);
      checks.push(name + ': obsolete callbacks cannot alter the current stream or arm closed/error timeouts');
    }
  }
  return checks;
};
if (require.main === module) module.exports().forEach(name => console.log('PASS ' + name));
