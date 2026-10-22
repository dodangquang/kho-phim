/* Shared startup notice. Acknowledgment is stored separately on each device. */
(function (global) {
  'use strict';
  var KEY = 'khophim_notice_seen';
  function seen(id) { try { return global.localStorage.getItem(KEY) === id; } catch (ignore) { return false; } }
  function playing() {
    var video = document.querySelector('video');
    var tv = document.getElementById('player');
    return !!(document.fullscreenElement || (video && !video.paused) ||
      (tv && tv.classList.contains('tv-player-overlay') && !tv.classList.contains('hidden')) ||
      document.querySelector('#player-overlay.open, #tv-player-overlay.open'));
  }
  function show(notice) {
    if (seen(notice.id) || document.getElementById('khophim-announcement')) return;
    if (playing()) { global.setTimeout(function () { show(notice); }, 2000); return; }
    var previous = document.activeElement;
    var overlay = document.createElement('div');
    overlay.id = 'khophim-announcement'; overlay.className = 'kho-notice-overlay';
    overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-labelledby', 'kho-notice-title');
    var card = document.createElement('div'); card.className = 'kho-notice-card';
    var title = document.createElement('h2'); title.id = 'kho-notice-title'; title.textContent = notice.title;
    var message = document.createElement('p'); message.textContent = notice.message;
    var close = document.createElement('button'); close.type = 'button'; close.textContent = 'Đã hiểu'; close.className = 'kho-notice-close';
    function dismiss() {
      try { global.localStorage.setItem(KEY, notice.id); } catch (ignore) {}
      global.removeEventListener('keydown', key, true);
      global.removeEventListener('focusin', focus, true);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (previous && document.documentElement.contains(previous) && previous.focus) previous.focus();
    }
    function key(event) {
      var code = event.keyCode;
      if ([8, 9, 13, 27, 32, 37, 38, 39, 40, 461, 10009].indexOf(code) < 0) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if ([8, 13, 27, 32, 461, 10009].indexOf(code) >= 0) dismiss(); else close.focus();
    }
    function focus(event) { if (event.target !== close) close.focus(); }
    close.onclick = dismiss;
    card.appendChild(title); card.appendChild(message); card.appendChild(close); overlay.appendChild(card); document.body.appendChild(overlay);
    global.addEventListener('keydown', key, true); global.addEventListener('focusin', focus, true); close.focus();
  }
  function start() {
    var xhr = new XMLHttpRequest();
    xhr.onprogress = function (event) { if (event.loaded > 16384) xhr.abort(); };
    xhr.onload = function () {
      if (xhr.status !== 200 || typeof xhr.responseText !== 'string' || xhr.responseText.length > 16384) return;
      try {
        var n = JSON.parse(xhr.responseText);
        if (n.active !== true || typeof n.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(n.id) || typeof n.title !== 'string' || !n.title || n.title.length > 120 || typeof n.message !== 'string' || !n.message || n.message.length > 1200) return;
        show(n);
      } catch (ignore) {}
    };
    xhr.onerror = xhr.ontimeout = xhr.onabort = function () {};
    try { xhr.open('GET', 'https://khophimqd.vercel.app/announcement.json', true); xhr.timeout = 5000; xhr.send(); } catch (ignore) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
}(window));
