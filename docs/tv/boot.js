/* Separate ES5 watchdog: a parse/runtime error must never leave a blank screen. */
(function () {
  'use strict';
  window.KhoBoot = { ready: false, error: '' };
  window.addEventListener('error', function (event) {
    if (event.message) window.KhoBoot.error = String(event.message).slice(0, 180);
  });
  window.setTimeout(function () {
    if (!window.KhoBoot.ready) {
      var panel = document.getElementById('boot-error');
      if (panel) panel.className = '';
    }
  }, 7000);
}());
