'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
module.exports = function () {
  let sequence = 0;
  const timers = new Map();
  const events = [];
  const av = {
    open() {}, setDisplayRect() {}, setListener() {}, setDisplayMethod() {},
    prepareAsync(success) { success(); }, getDuration() { return 3600000; },
    play() { events.push('play'); }, pause() {}, stop() {}, close() { events.push('close'); }
  };
  const platform = {
    document: { getElementById() { return { className: 'hidden' }; } },
    KhoCore: { safeUrl(url) { return url; } }, webapis: { avplay: av },
    setTimeout(callback) { const id = ++sequence; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); },
    Date
  };
  platform.window = platform;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'player.js'), 'utf8'), platform);
  const player = new platform.KhoPlayer({ message() {}, time() {}, state() {}, error() { events.push('error'); } });
  player.open('https://example.test/video.m3u8', 0);
  assert.equal(player.state, 'playing');
  assert.equal(timers.size, 1);
  const first = [...timers.keys()][0];
  player.tick(1000, true);
  assert.equal(timers.size, 1);
  assert.equal(timers.has(first), false);
  player.setPaused(true);
  assert.equal(timers.size, 0);
  player.setPaused(false);
  assert.equal(timers.size, 1);
  const [watchdogId, callback] = [...timers.entries()][0];
  timers.delete(watchdogId);
  callback();
  assert.equal(player.state, 'error');
  assert.equal(timers.size, 0);
  assert.equal(events.filter(item => item === 'error').length, 1);
  assert.equal(events.filter(item => item === 'close').length, 1);
};
