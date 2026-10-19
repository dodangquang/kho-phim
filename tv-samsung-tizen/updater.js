/* Stable local shell. Downloaded UI/player stays in the packaged app context,
   retaining AVPlay, remote keys, origin and history. Never installs a WGT. */
(function (global) {
  'use strict';
  var SHELL = 1;
  var PACKAGE_VERSION = '1.0.15';
  var BASE = 'https://khophimqd.vercel.app/samsung/';
  var KEY = 'khophim_samsung_ota_v1';
  var MAX = 800000;
  var localScripts = ['ratings.js', 'core.js', 'player.js', 'posters.js', 'home.js', 'app.js'];
  var state = { active: null, pending: null, trial: '', rejected: [] };
  var version = PACKAGE_VERSION;
  var status = 'Tự kiểm tra bản mới khi mở ứng dụng.';
  var checking = false;
  var storage = true;
  var listener = function () {};
  var canRestart = function () { return false; };
  function newer(a, b) {
    var x = a.split('.'); var y = b.split('.');
    for (var i = 0; i < 3; i++) { if (+x[i] !== +y[i]) return +x[i] > +y[i]; }
    return false;
  }
  function validVersion(value) { return typeof value === 'string' && /^\d{1,5}\.\d{1,5}\.\d{1,5}$/.test(value); }
  function save() {
    try { global.localStorage.setItem(KEY, JSON.stringify(state)); return true; }
    catch (ignore) { storage = false; return false; }
  }
  function notify(message) {
    if (message) status = message;
    listener();
  }
  function reject(hash) {
    if (typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash) && state.rejected.indexOf(hash) < 0) state.rejected.unshift(hash);
    state.rejected = state.rejected.slice(0, 8);
  }
  function recordData(record) {
    try {
      if (!record || !validVersion(record.version) || typeof record.text !== 'string' || record.text.length > MAX || !/^[a-f0-9]{64}$/.test(record.sha256)) return null;
      if (global.KhoUpdateHash(record.text) !== record.sha256) return null;
      var data = JSON.parse(record.text);
      if (data.schema !== 1 || data.shell !== SHELL || data.version !== record.version || typeof data.html !== 'string' || typeof data.css !== 'string' || typeof data.js !== 'string') return null;
      if (/<\s*(?:script|iframe|base)\b/i.test(data.html)) return null;
      return data;
    } catch (ignore) { return null; }
  }
  function clean(record) {
    if (!record) return null;
    if (!validVersion(record.version) || state.rejected.indexOf(record.sha256) >= 0 || !newer(record.version, PACKAGE_VERSION) || !recordData(record)) return null;
    return record;
  }
  try {
    var raw = global.localStorage.getItem(KEY);
    var parsed = raw && raw.length < MAX * 4 ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object') {
      state.rejected = Array.isArray(parsed.rejected) ? parsed.rejected.filter(function (hash) { return typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash); }).slice(0, 8) : [];
      if (parsed.trial) {
        reject(parsed.trial);
        status = 'Đã khôi phục bản trước vì lần cập nhật chưa khởi động thành công.';
      }
      state.active = clean(parsed.active);
      state.pending = clean(parsed.pending);
    }
  } catch (ignoreRead) { status = 'Dùng bản cài sẵn; bộ nhớ cập nhật chưa sẵn sàng.'; }
  /* Test writability before attempting a trial; never clear unrelated storage. */
  save();
  function get(url, limit, callback) {
    var xhr = new XMLHttpRequest();
    var done = false;
    function finish(error, text) {
      if (done) return;
      done = true;
      callback(error, text);
    }
    xhr.open('GET', url, true); xhr.timeout = 12000;
    xhr.onprogress = function (event) { if (event.loaded > limit) { finish(new Error('size')); xhr.abort(); } };
    xhr.onload = function () {
      if (xhr.status !== 200 || typeof xhr.responseText !== 'string' || xhr.responseText.length > limit) finish(new Error('download'));
      else finish(null, xhr.responseText);
    };
    xhr.onerror = xhr.ontimeout = xhr.onabort = function () { finish(new Error('network')); };
    try { xhr.send(); } catch (error) { finish(error); }
  }
  function check() {
    if (checking) return;
    if (!storage) { notify('TV chưa cho lưu bản cập nhật. Ứng dụng vẫn dùng bản hiện tại.'); return; }
    checking = true; notify('Đang kiểm tra cập nhật...');
    function finish(message) { checking = false; notify(message); }
    get(BASE + 'update.json?t=' + Date.now(), 4096, function (error, text) {
      if (error) { finish(state.pending ? 'Đã tải bản ' + state.pending.version + '. Mở lại app để cập nhật.' : 'Chưa kiểm tra được bản mới. Giữ bản hiện tại và thử lại khi có mạng.'); return; }
      var manifest;
      try { manifest = JSON.parse(text); } catch (ignore) {}
      if (!manifest || manifest.schema !== 1 || !validVersion(manifest.version) || !/^[a-f0-9]{64}$/.test(manifest.sha256) || manifest.bundle !== 'bundles/' + manifest.sha256 + '.json' || typeof manifest.size !== 'number' || manifest.size < 1 || manifest.size > MAX) {
        finish('Thông tin cập nhật không hợp lệ. Giữ bản hiện tại.'); return;
      }
      if (manifest.shell !== SHELL) { finish('Bản mới cần cập nhật gói WGT qua Apps2Samsung.'); return; }
      if (state.rejected.indexOf(manifest.sha256) >= 0) { finish('Đã bỏ qua bản không khởi động được. Chờ bản sửa tiếp theo.'); return; }
      if (!newer(manifest.version, version) || (state.pending && !newer(manifest.version, state.pending.version))) {
        finish(state.pending ? 'Đã tải bản ' + state.pending.version + '. Mở lại app để cập nhật.' : 'Đang dùng bản mới nhất (' + version + ').'); return;
      }
      notify('Đang tải bản ' + manifest.version + ' trong nền...');
      get(BASE + manifest.bundle, manifest.size, function (error, bundle) {
        if (error) { finish('Tải cập nhật chưa xong. Giữ bản hiện tại, sẽ thử lại lần sau.'); return; }
        var record = { version: manifest.version, sha256: manifest.sha256, text: bundle };
        if (unescape(encodeURIComponent(bundle)).length !== manifest.size || !recordData(record)) { finish('Bản tải về không toàn vẹn. Giữ bản hiện tại.'); return; }
        var previous = state.pending;
        state.pending = record;
        if (!save()) { state.pending = previous; finish('Không đủ bộ nhớ lưu cập nhật. Lịch sử xem được giữ nguyên.'); return; }
        finish('Đã tải bản ' + record.version + '. Tự cập nhật khi mở lại app, hoặc chọn Áp dụng ngay.');
      });
    });
  }
  global.KhoUpdate = {
    info: function () { return { packageVersion: PACKAGE_VERSION, version: version, status: status, checking: checking, pending: state.pending && state.pending.version, canRestore: !!state.active }; },
    bind: function (onchange, allowRestart) { listener = onchange; canRestart = allowRestart; notify(); },
    check: check,
    apply: function () {
      if (!state.pending || checking) return;
      if (!canRestart()) { notify('Đang phát phim. Bản mới sẽ áp dụng khi mở lại ứng dụng.'); return; }
      global.location.reload();
    },
    restore: function () {
      if (!canRestart() || (!state.active && !state.pending)) return;
      if (state.active) reject(state.active.sha256);
      if (state.pending) reject(state.pending.sha256);
      state.active = state.pending = null; state.trial = '';
      if (save()) global.location.reload();
      else notify('Chưa khôi phục được. Hãy đóng và mở lại ứng dụng.');
    }
  };
  function loadLocal(index) {
    if (index >= localScripts.length) { global.setTimeout(check, 2000); return; }
    var script = document.createElement('script');
    script.src = localScripts[index];
    script.onload = function () { loadLocal(index + 1); };
    script.onerror = function () { global.KhoBoot.error = 'Không tải được ' + localScripts[index]; };
    document.body.appendChild(script);
  }
  function run(record, data) {
    var isPending = !!state.pending && record.sha256 === state.pending.sha256;
    state.trial = record.sha256;
    if (!save()) { state.trial = ''; loadLocal(0); return; }
    version = record.version;
    var deadline = Date.now() + 5500;
    var readySince = 0;
    function rollback() {
      reject(record.sha256);
      if (state.active && state.active.sha256 === record.sha256) state.active = null;
      if (isPending) state.pending = null;
      /* Keep trial on disk until next boot to explain recovery to the viewer. */
      if (save()) global.location.reload();
      else { var panel = document.getElementById('boot-error'); if (panel) panel.className = ''; }
    }
    var monitor = global.setInterval(function () {
      if (global.KhoBoot.error || Date.now() > deadline) { global.clearInterval(monitor); rollback(); return; }
      if (!global.KhoBoot.ready) return;
      if (!global.KhoCore || global.KhoCore.VERSION !== record.version) { global.clearInterval(monitor); rollback(); return; }
      if (!readySince) readySince = Date.now();
      if (Date.now() - readySince < 750) return;
      global.clearInterval(monitor);
      if (isPending) { state.active = record; state.pending = null; }
      state.trial = ''; save();
      notify('Đã cập nhật lên ' + version + '. Tự kiểm tra bản mới khi mở ứng dụng.');
      global.setTimeout(check, 2000);
    }, 100);
    try {
      document.body.innerHTML = data.html;
      var cssUrl = global.URL.createObjectURL(new Blob([data.css], { type: 'text/css' }));
      var css = document.createElement('link'); css.rel = 'stylesheet'; css.href = cssUrl;
      css.onerror = function () { global.KhoBoot.error = 'Không nạp được giao diện cập nhật.'; };
      css.onload = function () {
        global.URL.revokeObjectURL(cssUrl);
        var bundledStyles = document.querySelectorAll('link[href="style.css"], link[href="tv-compat.css"]');
        for (var i = 0; i < bundledStyles.length; i++) bundledStyles[i].parentNode.removeChild(bundledStyles[i]);
        var jsUrl = global.URL.createObjectURL(new Blob([data.js], { type: 'application/javascript' }));
        var script = document.createElement('script'); script.src = jsUrl;
        script.onload = function () { global.URL.revokeObjectURL(jsUrl); };
        script.onerror = function () { global.URL.revokeObjectURL(jsUrl); global.KhoBoot.error = 'Không nạp được mã cập nhật.'; };
        document.body.appendChild(script);
      };
      document.head.appendChild(css);
    } catch (error) { global.KhoBoot.error = 'Không thể áp dụng bản cập nhật.'; }
  }
  var candidate = storage ? (state.pending || state.active) : null;
  if (candidate) run(candidate, recordData(candidate));
  else loadLocal(0);
}(window));
