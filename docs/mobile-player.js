/* Mobile playback lifecycle. Safari uses native HLS without downloading HLS.js. */
(function (global) {
  'use strict';
  let hlsDownload = null;
  const scriptSource = document.currentScript && document.currentScript.src;
  const hlsSource = scriptSource ? new URL('tv/vendor/hls.light-1.7.3.min.js', scriptSource).href : 'tv/vendor/hls.light-1.7.3.min.js';

  function loadHls() {
    if (global.Hls) return Promise.resolve(global.Hls);
    if (hlsDownload) return hlsDownload;
    hlsDownload = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = hlsSource;
      script.async = true;
      const timer = global.setTimeout(() => finish(new Error('HLS download timeout')), 10000);
      function finish(error) {
        global.clearTimeout(timer);
        script.onload = script.onerror = null;
        if (error) {
          script.remove();
          hlsDownload = null;
          reject(error);
        } else resolve(global.Hls);
      }
      script.onload = () => finish(global.Hls ? null : new Error('HLS unavailable'));
      script.onerror = () => finish(new Error('HLS download failed'));
      document.head.appendChild(script);
    });
    return hlsDownload;
  }

  global.KhoMobilePlayer = function (video, callbacks = {}) {
    let session = null;
    const live = s => session === s && !s.failed;
    const notify = name => { if (callbacks[name]) callbacks[name](); };
    function clearWatchdog(s) {
      global.clearTimeout(s.timer);
      s.timer = null;
    }
    function listen(s, event, callback) {
      const guarded = () => { if (live(s)) callback(); };
      video.addEventListener(event, guarded);
      s.listeners.push([event, guarded]);
    }
    function stop() {
      const old = session;
      session = null; // Invalidate promises and HLS callbacks before releasing media.
      if (old) {
        clearWatchdog(old);
        old.listeners.forEach(([event, callback]) => video.removeEventListener(event, callback));
        if (old.hls) old.hls.destroy();
      }
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
    function fail(s) {
      if (!live(s)) return;
      notify('onBeforeError');
      s.failed = true;
      stop();
      notify('onError');
    }
    function clampTime(target) {
      const ranges = video.seekable;
      if (video.readyState < 1 || !ranges || !ranges.length) return null;
      const duration = video.duration;
      const end = Number.isFinite(duration) && duration > 0 ? Math.max(0, duration - 0.25) : Infinity;
      target = Math.max(0, Math.min(target, end));
      let closest = ranges.start(0);
      let distance = Infinity;
      for (let i = 0; i < ranges.length; i++) {
        const start = ranges.start(i);
        const finish = Math.max(start, Math.min(ranges.end(i) - 0.05, end));
        const candidate = Math.max(start, Math.min(target, finish));
        if (Math.abs(candidate - target) < distance) {
          closest = candidate;
          distance = Math.abs(candidate - target);
        }
      }
      return closest;
    }
    function applySeek(s) {
      if (!live(s) || s.pendingSeek === null) return;
      const target = clampTime(s.pendingSeek);
      if (target === null) return; // loadedmetadata can precede Safari's seekable ranges.
      const pending = s.pendingSeek;
      s.pendingSeek = null;
      try { video.currentTime = target; }
      catch (_) { s.pendingSeek = pending; }
    }
    function play(s) {
      if (!live(s)) return;
      const engine = s.engine;
      const result = video.play(); // Native startup stays inside the original tap.
      if (result && result.catch) result.catch(error => {
        if (!live(s) || s.engine !== engine || error.name === 'AbortError') return;
        if (error.name === 'NotAllowedError') {
          clearWatchdog(s);
          notify('onTapRequired');
        } else recover(s);
      });
    }
    function watch(s, delay = 20000) {
      clearWatchdog(s);
      s.timer = global.setTimeout(() => {
        if (!live(s) || video.ended || (video.paused && !s.awaitingManifest)) return;
        if (document.hidden) { watch(s, delay); return; }
        recover(s);
      }, delay);
    }
    function nativeStart(s) {
      s.engine = 'native';
      video.disableRemotePlayback = false;
      video.src = s.url;
      video.load();
      watch(s);
      if (s.autoplay) play(s);
    }
    function mseStart(s) {
      s.engine = 'loading-hls';
      clearWatchdog(s);
      loadHls().then(Hls => {
        if (!live(s)) return;
        if (!Hls.isSupported()) { fail(s); return; }
        s.internalReset = true;
        video.pause();
        video.removeAttribute('src');
        video.load();
        // Required for ManagedMediaSource on newer iPhones.
        video.disableRemotePlayback = true;
        const hls = s.hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          maxBufferLength: 15,
          maxMaxBufferLength: 30,
          backBufferLength: 20,
          maxBufferSize: 24 * 1024 * 1024,
          capLevelToPlayerSize: true,
          startLevel: 0,
          startPosition: s.pendingSeek === null ? -1 : s.pendingSeek
        });
        s.engine = 'hls';
        s.awaitingManifest = true;
        // Manifest errors can remain nonfatal while HLS.js retries. Bound the
        // initial wait even though the media element is internally paused.
        watch(s);
        hls.on(Hls.Events.MEDIA_ATTACHED, () => {
          if (live(s) && s.hls === hls) hls.loadSource(s.url);
        });
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (!live(s) || s.hls !== hls) return;
          s.awaitingManifest = false;
          s.internalReset = false;
          clearWatchdog(s);
          applySeek(s);
          if (s.autoplay) { watch(s); play(s); }
        });
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (!live(s) || s.hls !== hls || !data.fatal) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR && s.networkRetries++ < 1) {
            hls.startLoad(video.currentTime || 0);
            watch(s);
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && s.mediaRetries++ < 1) {
            hls.recoverMediaError();
            watch(s);
          } else fail(s);
        });
        hls.attachMedia(video);
      }).catch(() => { if (live(s)) fail(s); });
    }
    function recover(s) {
      if (!live(s) || s.engine === 'loading-hls') return;
      clearWatchdog(s);
      // Preserve a seek target even if Safari raises an error before it can play.
      if (s.pendingSeek === null) s.pendingSeek = Math.max(0, video.currentTime || s.lastTime);
      notify('onRecover');
      if (s.engine === 'native' && s.nativeRetries++ < 1) {
        nativeStart(s);
      } else if (s.engine === 'native') {
        mseStart(s);
      } else fail(s);
    }
    function open(url, position = 0, options = {}) {
      stop();
      const s = session = {
        url, engine: '', pendingSeek: Number.isFinite(position) && position > 0 ? position : null,
        lastTime: 0, nativeRetries: 0, networkRetries: 0, mediaRetries: 0,
        timer: null, listeners: [], hls: null, failed: false, awaitingManifest: false,
        autoplay: options.autoplay !== false, internalReset: false
      };
      if (options.unmute !== false) video.muted = false;
      ['loadedmetadata', 'durationchange', 'canplay', 'progress'].forEach(event => listen(s, event, () => applySeek(s)));
      listen(s, 'timeupdate', () => {
        if (!video.seeking && video.readyState >= 2) s.lastTime = video.currentTime;
      });
      listen(s, 'playing', () => clearWatchdog(s));
      listen(s, 'play', () => { s.autoplay = true; });
      ['waiting', 'stalled', 'seeking'].forEach(event => listen(s, event, () => watch(s, 15000)));
      listen(s, 'seeked', () => {
        if (video.paused || video.readyState >= 3) clearWatchdog(s);
      });
      listen(s, 'pause', () => {
        if (video.paused && !video.error && !s.internalReset) {
          clearWatchdog(s);
          s.autoplay = false;
        }
      });
      listen(s, 'error', () => {
        if (s.engine === 'native' && video.error) recover(s);
      });
      if (!url) { fail(s); return; }
      const agent = global.navigator.userAgent;
      const apple = /iphone|ipad|ipod/i.test(agent) || (/safari/i.test(agent) && !/chrome|chromium|crios|edg|opr/i.test(agent));
      if (video.canPlayType('application/vnd.apple.mpegurl') && (apple || !(global.MediaSource || global.ManagedMediaSource))) {
        nativeStart(s);
      } else mseStart(s);
    }
    return {
      open, stop,
      seekTo(seconds) {
        if (!session || session.failed || !Number.isFinite(seconds)) return false;
        session.pendingSeek = Math.max(0, seconds);
        applySeek(session);
        return session.pendingSeek === null;
      },
      seekBy(seconds) {
        if (!session || session.failed || !Number.isFinite(seconds)) return false;
        session.pendingSeek = Math.max(0, (session.pendingSeek === null ? video.currentTime || 0 : session.pendingSeek) + seconds);
        applySeek(session);
        return session.pendingSeek === null;
      }
    };
  };
  global.KhoVideoPlayer = global.KhoMobilePlayer;
}(window));
