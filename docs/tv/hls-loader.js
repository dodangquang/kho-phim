/* Web only. Do not download or parse HLS.js while browsing movie shelves. */
(function (global) {
  'use strict';
  var waiting = [];
  var script = null;
  var timer = null;
  function complete(error) {
    global.clearTimeout(timer);
    if (script) script.onload = script.onerror = null;
    if (error && script && script.parentNode) script.parentNode.removeChild(script);
    script = null;
    var callbacks = waiting;
    waiting = [];
    callbacks.forEach(function (callback) { callback(error); });
  }
  function load(callback) {
    if (global.Hls) { callback(null); return; }
    waiting.push(callback);
    if (script) return;
    script = document.createElement('script');
    script.src = 'vendor/hls.light-1.7.3.min.js';
    script.async = true;
    script.onload = function () { complete(global.Hls ? null : new Error('HLS unavailable')); };
    script.onerror = function () { complete(new Error('HLS download failed')); };
    timer = global.setTimeout(function () { complete(new Error('HLS download timeout')); }, 10000);
    document.head.appendChild(script);
  }
  function canUseMse() {
    var source = global.MediaSource || global.WebKitMediaSource;
    return !!(source && typeof source.isTypeSupported === 'function');
  }
  global.KhoWebHls = {
    canUseMse: canUseMse,
    preferMse: function () {
      var agent = global.navigator ? global.navigator.userAgent : '';
      var nativeDevice = /tizen|web0s|webos|netcast|smart[- ]?tv|hbbtv|android tv|ipad|iphone|ipod/i.test(agent);
      var safari = /safari/i.test(agent) && !/chrome|chromium|crios|edg|opr/i.test(agent);
      return canUseMse() && !nativeDevice && !safari;
    },
    open: function (player, url, token) {
      load(function (error) {
        if (player.token !== token) return;
        if (error || !global.Hls || !global.Hls.isSupported()) {
          player.fail('Trình duyệt không mở được HLS. Hãy thử nguồn khác hoặc cài bản Samsung qua Apps2Samsung.');
          return;
        }
        try {
          var hls = new global.Hls({ enableWorker: true, maxBufferLength: 12, maxMaxBufferLength: 24, backBufferLength: 10, maxBufferSize: 16 * 1024 * 1024, capLevelToPlayerSize: true, startLevel: 0 });
          player.hls = hls;
          hls.on(global.Hls.Events.MEDIA_ATTACHED, function () {
            if (player.token === token && player.hls === hls) hls.loadSource(url);
          });
          hls.on(global.Hls.Events.ERROR, function (event, data) {
            if (data.fatal && player.token === token && player.hls === hls) player.fail('Không phát được nguồn HLS này. Nhấn Return để chọn nguồn khác.');
          });
          hls.attachMedia(player.video);
        } catch (ignore) { if (player.token === token) player.fail('Không khởi động được trình phát HLS. Nhấn Return để chọn nguồn khác.'); }
      });
    }
  };
}(window));
