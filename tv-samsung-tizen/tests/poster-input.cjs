'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function runtime() {
  let now = 0;
  let sequence = 0;
  const timers = new Map();
  const images = [];
  function setTimer(callback, delay) { const id = ++sequence; timers.set(id, { callback, at: now + delay }); return id; }
  function advance(delay) {
    const until = now + delay;
    for (;;) {
      const next = [...timers.entries()].filter(([, task]) => task.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      now = next[1].at; timers.delete(next[0]); next[1].callback();
    }
    now = until;
  }
  const platform = {
    Date: { now: () => now }, setTimeout: setTimer, clearTimeout: id => timers.delete(id),
    requestAnimationFrame: callback => setTimer(callback, 16),
    document: {
      documentElement: { contains: canvas => !!canvas.attached },
      createElement() {
        const attrs = {};
        const draws = [];
        return { draws, setAttribute: (key, value) => { attrs[key] = value; }, getAttribute: key => attrs[key], removeAttribute: key => { delete attrs[key]; }, getContext: () => ({ drawImage: (...args) => draws.push(args) }) };
      }
    },
    Image: function () { this.naturalWidth = 2000; this.naturalHeight = 3000; images.push(this); }
  };
  platform.window = platform;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'posters.js'), 'utf8'), platform);
  const posters = platform.KhoPosters;
  function card(url, landscape = false) {
    const canvas = posters.create(url, landscape);
    canvas.attached = true;
    canvas.parentNode = { clientWidth: landscape ? 280 : 248, clientHeight: landscape ? 156 : 346 };
    return canvas;
  }
  return { posters, images, advance, card };
}
module.exports = function () {
  const checks = [];
  {
    const { posters, images, advance, card } = runtime();
    const prefetch = card('prefetch');
    const first = card('visible-one');
    const second = card('visible-two');
    posters.request(prefetch, true, 1); posters.request(first, true, 0); posters.request(second, true, 0);
    advance(16);
    assert.deepEqual(images.map(image => image.src), ['visible-one', 'visible-two']);
    assert.equal(posters.stats().active, 2);
    posters.deferForInput(); images[0].onload();
    advance(50); posters.deferForInput(); advance(50); posters.deferForInput(); advance(19);
    assert.equal(first._painted, undefined);
    advance(1);
    assert.equal(first._painted, true, 'Repeated input may defer painting for at most 120ms');
    advance(16);
    assert.equal(images.length, 3);
    assert.equal(images[2].src, 'prefetch');
    assert.equal(posters.stats().active, 2);
    checks.push('Two bounded poster downloads prioritize visible cards; repeated input cannot starve painting');
    const draw = first.draws[0];
    assert.equal(draw[0].width, 240); assert.equal(draw[0].height, 360);
    assert.equal(first.width, 248); assert.equal(first.height, 346);
    assert.ok(Math.abs(draw[3] / draw[4] - first.width / first.height) < 0.001, 'Cover crop preserves source proportions');
    first.parentNode.clientWidth = 220;
    const loads = posters.stats().loads;
    posters.request(first, true);
    assert.equal(first.width, 220); assert.equal(first.height, 346);
    assert.equal(posters.stats().loads, loads);
    posters.request(first, false);
    assert.equal(first._painted, true); assert.equal(first.width, 220);
    checks.push('Small thumbnails keep source aspect ratio; resize redraws from cache and offscreen cards keep pixels');
  }
  {
    const { posters, images, advance, card } = runtime();
    const discarded = card('not-visible');
    posters.request(discarded, true); posters.request(discarded, false); advance(16);
    assert.equal(images.length, 0, 'Queued offscreen posters must not start downloading');
    const first = card('same'); const duplicate = card('same');
    posters.request(first, true); posters.request(duplicate, true); advance(16);
    assert.equal(images.length, 1);
    first.attached = false; duplicate.attached = false; posters.prune();
    assert.equal(posters.stats().active, 1, 'Scrolling away must not abort a started download');
    images[0].onload();
    const restored = card('same');
    posters.deferForInput(); posters.request(restored, true);
    assert.equal(restored._painted, true, 'Cache restore paints immediately without a focus event');
    assert.equal(images.length, 1);
    posters.release({ querySelectorAll: () => [restored] });
    assert.equal(restored.width, 0);
    posters.request(restored, true);
    assert.equal(restored._painted, true);
    assert.equal(images.length, 1);
    checks.push('Duplicate posters share one load; detached rows and playback restore from cache without refetch');
  }
  {
    const { posters, images, advance, card } = runtime();
    for (let index = 0; index < 60; index++) {
      const node = card('film-' + index);
      posters.request(node, true); advance(16); images[images.length - 1].onload(); node.attached = false; posters.prune();
      assert.ok(posters.stats().entries <= 48);
      assert.ok(posters.stats().bytes <= 16 * 1024 * 1024);
    }
    assert.equal(posters.stats().entries, 48);
    const before = images.length;
    posters.request(card('film-59'), true); assert.equal(images.length, before);
    posters.request(card('film-0'), true); advance(16); assert.equal(images.length, before + 1);
    const staleLoad = images[images.length - 1].onload;
    posters.clear(); staleLoad(); advance(1000);
    assert.equal(posters.stats().entries, 0); assert.equal(posters.stats().bytes, 0); assert.equal(posters.stats().active, 0);
    checks.push('Thumbnail LRU stays within 48 entries and 16MiB; clear cancels stale callbacks');
  }
  return checks;
};
