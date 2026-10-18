/* Native Samsung decoder; no hls.js, iframe, web redirect or synchronous prepare. */
(function (global) {
  'use strict';
  function Player(callbacks) {
    this.callbacks = callbacks;
    this.av = global.webapis && global.webapis.avplay;
    this.video = document.getElementById('video');
    this.mode = '';
    this.state = 'closed';
    this.token = 0;
    this.position = 0;
    this.duration = 0;
    this.seeking = false;
    this.seekTarget = null;
    this.seekTimer = null;
    this.watchdog = null;
    this.lastTick = 0;
  }
  Player.prototype.screenSaver = function (enabled) {
    try {
      if (global.webapis && global.webapis.appcommon) {
        global.webapis.appcommon.setScreenSaver(enabled ? 'SCREEN_SAVER_ON' : 'SCREEN_SAVER_OFF');
      }
    } catch (ignore) {}
  };
  Player.prototype.stop = function () {
    this.token++;
    clearTimeout(this.watchdog);
    clearTimeout(this.seekTimer);
    this.seeking = false;
    this.seekTarget = null;
    if (this.mode === 'avplay') {
      try { this.av.stop(); } catch (ignoreStop) {}
      try { this.av.close(); } catch (ignoreClose) {}
    }
    if (this.mode === 'video') {
      this.video.onloadedmetadata = this.video.ontimeupdate = this.video.onerror = this.video.onended = this.video.onwaiting = this.video.onplaying = null;
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.load();
    }
    this.video.className = 'hidden';
    this.mode = '';
    this.state = 'closed';
    this.screenSaver(true);
  };
  Player.prototype.fail = function (message) {
    this.stop();
    this.state = 'error';
    this.callbacks.error(message);
  };
  Player.prototype.armWatchdog = function (token) {
    var self = this;
    if (token !== this.token) return;
    clearTimeout(this.watchdog);
    this.watchdog = null;
    if (this.state !== 'preparing' && this.state !== 'playing') return;
    this.watchdog = setTimeout(function () {
      if (token === self.token && (self.state === 'preparing' || self.state === 'playing')) self.fail('Nguồn phát không phản hồi trong 25 giây. Nhấn Return và chọn nguồn hoặc tập khác.');
    }, 25000);
  };
  Player.prototype.tick = function (position, force) {
    if (this.state === 'playing' && Number(position) > this.position) this.armWatchdog(this.token);
    this.position = Math.max(0, Number(position) || 0);
    if (!force && Date.now() - this.lastTick < 1000) return;
    this.lastTick = Date.now();
    this.callbacks.time(this.position, this.duration);
  };
  Player.prototype.open = function (url, resume) {
    this.stop();
    this.position = 0;
    this.duration = 0;
    this.lastTick = 0;
    var self = this;
    var token = this.token;
    if (!global.KhoCore.safeUrl(url)) { this.fail('Không có liên kết phát trực tiếp. Hãy chọn nguồn khác.'); return; }
    this.state = 'preparing';
    this.callbacks.message('Đang mở nguồn phát...');
    this.armWatchdog(token);
    if (this.av) {
      this.mode = 'avplay';
      try {
        this.av.open(url);
        this.av.setDisplayRect(0, 0, 1920, 1080);
        this.av.setListener({
          onbufferingstart: function () {
            if (token !== self.token) return;
            if (self.state !== 'paused') self.callbacks.message('Đang tải video...');
            self.armWatchdog(token);
          },
          onbufferingprogress: function () {},
          onbufferingcomplete: function () {
            if (token !== self.token) return;
            self.armWatchdog(token);
            self.callbacks.message('');
          },
          oncurrentplaytime: function (ms) { if (token === self.token) self.tick(ms, false); },
          onstreamcompleted: function () {
            if (token !== self.token) return;
            self.callbacks.ended();
          },
          onerror: function (error) {
            if (token === self.token) self.fail('TV không phát được nguồn này (' + String(error || 'AVPlay') + '). Nhấn Return để đổi nguồn.');
          },
          onsubtitlechange: function (duration, text) {
            if (token === self.token) self.callbacks.subtitle(String(text || ''), Number(duration) || 0);
          }
        });
        this.av.prepareAsync(function () {
          if (token !== self.token) return;
          clearTimeout(self.watchdog);
          try {
            self.duration = Number(self.av.getDuration()) || 0;
            try { self.av.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX'); } catch (ignoreDisplay) {}
            function begin() {
              if (token !== self.token) return;
              try {
                self.av.play();
                self.state = 'playing';
                self.screenSaver(false);
                self.callbacks.message('');
                self.callbacks.state('playing');
                self.armWatchdog(token);
              } catch (ignorePlay) { self.fail('Không khởi động được video. Nhấn Return để chọn nguồn khác.'); }
            }
            var position = self.clamp(resume);
            if (position > 0) { self.armWatchdog(token); self.av.seekTo(position, begin, begin); }
            else begin();
          } catch (ignoreReady) { self.fail('Không đọc được video. Nhấn Return để chọn nguồn khác.'); }
        }, function () {
          if (token === self.token) self.fail('Không chuẩn bị được nguồn phát. Nhấn Return để đổi nguồn.');
        });
      } catch (ignoreOpen) { this.fail('AVPlay không mở được liên kết. Nhấn Return để đổi nguồn.'); }
      return;
    }
    /* Desktop preview only: HTML5 native playback, never software HLS. */
    this.mode = 'video';
    if (/\.m3u8(?:[?#]|$)/i.test(url) && !this.video.canPlayType('application/vnd.apple.mpegurl')) {
      this.fail('Bản xem trước trên máy tính không hỗ trợ HLS gốc. Cài app trên Samsung TV để dùng AVPlay.');
      return;
    }
    this.video.className = '';
    this.video.onloadedmetadata = function () {
      if (token !== self.token) return;
      self.duration = (Number(self.video.duration) || 0) * 1000;
      self.video.currentTime = self.clamp(resume) / 1000;
      var result = self.video.play();
      if (result && result.catch) result.catch(function () { if (token === self.token) self.fail('Không thể tự phát video.'); });
    };
    this.video.onplaying = function () {
      if (token !== self.token) return;
      self.state = 'playing';
      clearTimeout(self.watchdog);
      self.callbacks.message('');
      self.callbacks.state('playing');
    };
    this.video.onwaiting = function () { if (token === self.token) self.armWatchdog(token); };
    this.video.ontimeupdate = function () { if (token === self.token) self.tick(self.video.currentTime * 1000, false); };
    this.video.onended = function () { if (token === self.token) self.callbacks.ended(); };
    this.video.onerror = function () { if (token === self.token) self.fail('Không thể phát video. Nhấn Return để đổi nguồn.'); };
    this.video.src = url;
    this.video.load();
  };
  Player.prototype.clamp = function (position) {
    var value = Math.max(0, Math.round(Number(position) || 0));
    return this.duration > 0 ? Math.min(value, Math.max(0, this.duration - 1000)) : value;
  };
  Player.prototype.setPaused = function (paused) {
    if (this.state !== 'playing' && this.state !== 'paused') return;
    try {
      if (this.mode === 'avplay') {
        if (paused) this.av.pause(); else this.av.play();
      } else {
        if (paused) this.video.pause(); else this.video.play();
      }
      this.state = paused ? 'paused' : 'playing';
      if (paused) clearTimeout(this.watchdog);
      else this.armWatchdog(this.token);
      this.screenSaver(paused);
      this.callbacks.state(this.state);
    } catch (ignore) { this.callbacks.message('TV chưa sẵn sàng. Vui lòng thử lại.'); }
  };
  Player.prototype.seek = function (delta) {
    if (this.state !== 'playing' && this.state !== 'paused') return;
    this.seekTarget = this.clamp((this.seekTarget === null ? this.position : this.seekTarget) + delta);
    this.callbacks.message('Tua đến ' + global.KhoCore.time(this.seekTarget));
    clearTimeout(this.seekTimer);
    var self = this;
    var token = this.token;
    this.seekTimer = setTimeout(function () { if (token === self.token) self.flushSeek(); }, 180);
  };
  Player.prototype.flushSeek = function () {
    if (this.seeking || this.seekTarget === null) return;
    var self = this;
    var token = this.token;
    var target = this.seekTarget;
    this.seekTarget = null;
    this.seeking = true;
    this.armWatchdog(token);
    function done() {
      if (token !== self.token) return;
      self.seeking = false;
      self.callbacks.message('');
      self.flushSeek();
    }
    try {
      if (this.mode === 'avplay') this.av.seekTo(target, function () { if (token === self.token) self.tick(target, true); done(); }, done);
      else { this.video.currentTime = target / 1000; self.tick(target, true); done(); }
    } catch (ignore) { done(); }
  };
  global.KhoPlayer = Player;
}(window));
