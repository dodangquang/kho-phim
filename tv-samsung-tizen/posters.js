/* Keep small source thumbnails across virtual shelves. Never read CDN pixels or
   retain full-size source images after decoding. Runtime remains ES5 for Tizen. */
(function (global) {
  'use strict';
  var LIMIT = 48;
  var BYTE_LIMIT = 16 * 1024 * 1024;
  var cache = [];
  var cacheBytes = 0;
  var tasks = [];
  var active = 0;
  var frame = null;
  var inputUntil = 0;
  var generation = 0;
  var loads = 0;
  var hits = 0;
  function attached(canvas) { return document.documentElement.contains(canvas); }
  function keyOf(canvas) { return (canvas._landscape ? 'L|' : 'P|') + canvas.getAttribute('data-src'); }
  function schedule() {
    if (frame !== null) return;
    frame = global.requestAnimationFrame(function () { frame = null; pump(); });
  }
  function cached(key) {
    for (var i = 0; i < cache.length; i++) {
      if (cache[i].key === key) {
        var entry = cache.splice(i, 1)[0];
        cache.push(entry);
        return entry;
      }
    }
    return null;
  }
  function remember(entry) {
    cache.push(entry);
    cacheBytes += entry.bytes;
    while (cache.length > LIMIT || cacheBytes > BYTE_LIMIT) {
      var removed = cache.shift();
      cacheBytes -= removed.bytes;
      removed.bitmap.width = removed.bitmap.height = 0;
    }
  }
  function box(canvas) {
    var parent = canvas.parentNode;
    return {
      width: Math.max(1, parent && parent.clientWidth ? parent.clientWidth : (canvas._landscape ? 280 : 248)),
      height: Math.max(1, parent && parent.clientHeight ? parent.clientHeight : (canvas._landscape ? 156 : 346))
    };
  }
  function render(canvas, entry) {
    if (!attached(canvas) || !canvas._wanted) return;
    var size = box(canvas);
    if (canvas._painted && canvas._displayWidth === size.width && canvas._displayHeight === size.height) return;
    try {
      canvas.width = Math.min(canvas._landscape ? 560 : 320, Math.round(size.width));
      canvas.height = Math.max(1, Math.round(canvas.width * size.height / size.width));
      var ratio = canvas.width / canvas.height;
      var sourceWidth = entry.bitmap.width;
      var sourceHeight = entry.bitmap.height;
      var cropWidth = sourceWidth;
      var cropHeight = sourceHeight;
      if (sourceWidth / sourceHeight > ratio) cropWidth = sourceHeight * ratio;
      else cropHeight = sourceWidth / ratio;
      canvas.getContext('2d').drawImage(entry.bitmap, (sourceWidth - cropWidth) / 2, (sourceHeight - cropHeight) / 2, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);
      canvas._painted = true;
      canvas._displayWidth = size.width;
      canvas._displayHeight = size.height;
      canvas.setAttribute('data-painted', 'true');
      canvas.removeAttribute('data-poster-error');
    } catch (error) { canvas.setAttribute('data-poster-error', String(error.name || error)); }
  }
  function finish(task) {
    if (task.done) return;
    task.done = true;
    global.clearTimeout(task.timer);
    global.clearTimeout(task.paintTimer);
    if (task.image) {
      task.image.onload = task.image.onerror = null;
      task.image.src = '';
      task.image = null;
      active--;
    }
    task.targets.forEach(function (canvas) { canvas._queued = false; });
    var index = tasks.indexOf(task);
    if (index !== -1) tasks.splice(index, 1);
    schedule();
  }
  function thumbnail(task) {
    if (task.done || task.generation !== generation) return;
    var now = Date.now();
    if (!task.paintDeadline) task.paintDeadline = now + 120;
    if (now < inputUntil && now < task.paintDeadline) {
      task.paintTimer = global.setTimeout(function () { thumbnail(task); }, Math.max(1, Math.min(inputUntil, task.paintDeadline) - now));
      return;
    }
    try {
      var sourceWidth = task.image.naturalWidth;
      var sourceHeight = task.image.naturalHeight;
      if (!sourceWidth || !sourceHeight) throw new Error('Empty poster');
      var scale = Math.min(1, (task.landscape ? 384 : 240) / sourceWidth, (task.landscape ? 216 : 360) / sourceHeight);
      var bitmap = document.createElement('canvas');
      bitmap.width = Math.max(1, Math.round(sourceWidth * scale));
      bitmap.height = Math.max(1, Math.round(sourceHeight * scale));
      bitmap.getContext('2d').drawImage(task.image, 0, 0, bitmap.width, bitmap.height);
      var entry = { key: task.key, bitmap: bitmap, bytes: bitmap.width * bitmap.height * 4 };
      remember(entry);
      task.targets.forEach(function (canvas) { render(canvas, entry); });
    } catch (error) {
      task.targets.forEach(function (canvas) { canvas.setAttribute('data-poster-error', String(error.name || error)); });
    }
    finish(task);
  }
  function start(task) {
    var image = new global.Image();
    task.image = image;
    task.state = 'loading';
    active++;
    loads++;
    task.timer = global.setTimeout(function () { finish(task); }, 8000);
    image.decoding = 'async';
    image.onload = function () {
      if (task.done) return;
      if (typeof image.decode === 'function') image.decode().then(function () { thumbnail(task); }, function () { thumbnail(task); });
      else thumbnail(task);
    };
    image.onerror = function () {
      if (task.done) return;
      if (!task.fallback) { task.fallback = true; image.src = 'icon.png'; }
      else finish(task);
    };
    image.src = task.url;
  }
  function pump() {
    prune();
    while (active < 2) {
      var next = null;
      tasks.forEach(function (task) {
        task.priority = task.targets.reduce(function (priority, canvas) { return Math.min(priority, canvas._priority); }, 1);
        if (task.state === 'queued' && task.targets.length && (!next || task.priority < next.priority)) next = task;
      });
      if (!next) break;
      start(next);
    }
  }
  function request(canvas, wanted, priority) {
    canvas._wanted = wanted;
    canvas._priority = priority || 0;
    // Leaving the viewport must not erase already painted cards.
    if (!wanted) return;
    var size = box(canvas);
    if (canvas._painted && canvas._displayWidth === size.width && canvas._displayHeight === size.height) return;
    var key = keyOf(canvas);
    var entry = cached(key);
    if (entry) { hits++; render(canvas, entry); return; }
    var task = null;
    tasks.forEach(function (item) { if (item.key === key) task = item; });
    if (!task) {
      task = { key: key, url: canvas.getAttribute('data-src'), landscape: canvas._landscape, targets: [], priority: priority || 0, state: 'queued', generation: generation };
      tasks.push(task);
    }
    task.priority = Math.min(task.priority, priority || 0);
    if (task.targets.indexOf(canvas) === -1) task.targets.push(canvas);
    canvas._queued = true;
    schedule();
  }
  function prune() {
    tasks.slice().forEach(function (task) {
      task.targets = task.targets.filter(function (canvas) {
        var keep = attached(canvas) && canvas._wanted;
        if (!keep) canvas._queued = false;
        return keep;
      });
      // Complete the two in-flight downloads into cache, even if their row moved.
      if (task.state === 'queued' && !task.targets.length) finish(task);
    });
  }
  global.KhoPosters = {
    deferForInput: function () { inputUntil = Date.now() + 60; },
    create: function (url, landscape) {
      var canvas = document.createElement('canvas');
      canvas._landscape = !!landscape;
      canvas.width = canvas.height = 0;
      canvas.setAttribute('data-src', url);
      canvas.setAttribute('aria-hidden', 'true');
      return canvas;
    },
    request: request,
    prune: prune,
    release: function (root) {
      Array.prototype.forEach.call(root.querySelectorAll('canvas[data-src]'), function (canvas) {
        canvas._wanted = false;
        canvas.width = canvas.height = 0;
        canvas._painted = false;
        canvas.removeAttribute('data-painted');
      });
      prune();
    },
    clear: function () {
      generation++;
      tasks.slice().forEach(finish);
      cache.forEach(function (entry) { entry.bitmap.width = entry.bitmap.height = 0; });
      cache = [];
      cacheBytes = 0;
    },
    stats: function () { return { entries: cache.length, bytes: cacheBytes, active: active, queued: tasks.length - active, loads: loads, hits: hits, limit: LIMIT, byteLimit: BYTE_LIMIT }; }
  };
}(window));
