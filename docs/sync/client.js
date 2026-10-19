(function (root) {
  'use strict';
  var config = root.KHO_SYNC_CONFIG || {};
  var H = root.KhoHistory, store = new H.Store(root.localStorage), listeners = [];
  var historyListeners = [], accountListeners = [], historyStamp = '';
  var session = null, generation = 0, refreshFlight = null, syncFlight = null, syncTimer = null;
  var status = 'Chưa đăng nhập';
  var sessionKey = 'khophim_sync_auth_v1';
  function read(key) { try { return JSON.parse(root.localStorage.getItem(key) || 'null'); } catch (ignore) { return null; } }
  store.migrate(['khophim_history', 'kho_phim_history', 'phimmoi_history', 'khophim_desktop_watch_history', 'khophim_tv_watch_history'].map(read));
  function validSession(value) { return value && /^[a-zA-Z0-9_-]{1,128}$/.test(value.uid) && typeof value.refreshToken === 'string' && typeof value.idToken === 'string'; }
  function notify() {
    var stamp = JSON.stringify(store.history());
    if (stamp !== historyStamp) { historyStamp = stamp; historyListeners.forEach(function (fn) { fn(); }); }
    listeners.forEach(function (fn) { fn(); });
  }
  function setSession(value, importGuest) {
    var next = validSession(value) ? value : null;
    if ((session ? session.uid : null) !== (next ? next.uid : null)) accountListeners.forEach(function (fn) { try { fn(); } catch (ignore) {} });
    generation++; refreshFlight = null; syncFlight = null; session = validSession(value) ? value : null;
    if (session) root.localStorage.setItem(sessionKey, JSON.stringify(session)); else root.localStorage.removeItem(sessionKey);
    store.switchOwner(session ? session.uid : 'guest', !!session && !!importGuest);
    status = session ? 'Đang đồng bộ…' : 'Chưa đăng nhập'; notify(); if (session) schedule(0);
  }
  function token() {
    if (!session) return Promise.reject(new Error('Chưa đăng nhập.'));
    if (session.expiresAt > Date.now() + 60000) return Promise.resolve(session.idToken);
    if (refreshFlight) return refreshFlight;
    var owner = session.uid, epoch = generation, saved = session;
    refreshFlight = transport.refresh(saved.refreshToken).then(function (result) {
      if (epoch !== generation || !session || session.uid !== owner) throw new Error('Tài khoản đã thay đổi.');
      if (result.user_id !== owner) { setSession(null); throw new Error('Phiên đăng nhập không hợp lệ.'); }
      session.idToken = result.id_token; session.refreshToken = result.refresh_token; session.expiresAt = Date.now() + Number(result.expires_in) * 1000;
      root.localStorage.setItem(sessionKey, JSON.stringify(session)); return session.idToken;
    }).catch(function (e) { if (epoch === generation && (e.status === 400 || e.status === 401)) setSession(null); throw e; });
    var flight = refreshFlight;
    flight.then(function () { if (refreshFlight === flight) refreshFlight = null; }, function () { if (refreshFlight === flight) refreshFlight = null; });
    return flight;
  }
  var transport = new root.KhoSyncTransport(config, token);
  function schedule(delay) { clearTimeout(syncTimer); syncTimer = setTimeout(sync, delay == null ? 1500 : delay); }
  function sync() {
    if (!config.enabled || !session) return Promise.resolve();
    if (document.hidden) { schedule(30000); return Promise.resolve(); }
    if (syncFlight) return syncFlight.then(function () { return sync(); });
    var uid = session.uid, epoch = generation;
    function current() { return epoch === generation && session && session.uid === uid; }
    var flight = transport.readHistory(uid).then(function (remote) {
      if (!current()) return;
      store.reconcile(remote.rows, remote.clearedAt); notify();
      var state = store.read();
      var start = state.clearDirty ? transport.clear(uid, state.clearedAt).then(function (meta) { if (current()) store.reconcile([], meta.clearedAt); }) : Promise.resolve();
      return state.rows.filter(function (row) { return state.dirty[row.movieSlug] === row.timestamp; }).reduce(function (promise, row) {
        return promise.then(function () {
          if (!current()) return;
          return transport.upsert(uid, row).then(function (chosen) { if (current()) { store.reconcile([chosen], 0); store.ack(row.movieSlug, row.timestamp); } });
        });
      }, start);
    }).then(function () { if (current()) { status = 'Đã đồng bộ'; notify(); } }).catch(function () {
      if (current()) { status = 'Chưa đồng bộ được. Lịch sử vẫn được lưu trên thiết bị.'; notify(); }
    });
    syncFlight = flight;
    flight.then(function () { if (syncFlight === flight) syncFlight = null; if (current()) schedule(30000); });
    return flight;
  }
  function sessionFromResponse(result) {
    return { uid: result.localId, idToken: result.idToken, refreshToken: result.refreshToken, expiresAt: Date.now() + Number(result.expiresIn) * 1000, name: result.displayName || result.email || 'Tài khoản Google' };
  }
  function changed() { if (session) status = 'Đang chờ đồng bộ…'; notify(); if (session) schedule(); }
  var api = {
    enabled: !!(config.enabled && config.projectId && config.apiKey && config.authDomain),
    history: function () { return store.history(); },
    save: function (item) { store.save(item); changed(); },
    remove: function (slug) { store.remove(slug); changed(); },
    clear: function () { store.clear(); changed(); },
    sync: sync, signOut: function () { setSession(null); },
    user: function () { return session ? { uid: session.uid, name: session.name } : null; },
    status: function () { return status; },
    onChange: function (fn) { listeners.push(fn); return function () { var i = listeners.indexOf(fn); if (i !== -1) listeners.splice(i, 1); }; },
    onHistoryChange: function (fn) { historyListeners.push(fn); },
    onBeforeAccountChange: function (fn) { accountListeners.push(fn); },
    signIn: function () {
      var account = new URL('../account/', document.currentScript ? document.currentScript.src : root.location.href);
      // The adapter sets the account path explicitly for nested TV/desktop pages.
      account = new URL(config.accountUrl || account.href);
      if (root.location.protocol === 'https:') account = new URL('/' + (root.location.pathname.indexOf('/kho-phim/') === 0 ? 'kho-phim/' : '') + 'account/', root.location.origin);
      account.searchParams.set('return', root.location.pathname + root.location.search); root.location.assign(account.href);
    },
    acceptGoogle: function (idToken, expectedUid) { return transport.google(idToken).then(function (result) { if (expectedUid && result.localId !== expectedUid) throw new Error('Tài khoản đăng nhập không khớp.'); var value = sessionFromResponse(result); setSession(value, true); return value; }); },
    acceptPairedGoogle: function (idToken, expectedUid) { return transport.google(idToken).then(function (result) { if (result.localId !== expectedUid) throw new Error('Tài khoản liên kết không khớp.'); var value = sessionFromResponse(result); setSession(value, true); return value; }); },
    transport: transport
  };
  root.KhoSync = api;
  var restored = read(sessionKey); if (api.enabled && validSession(restored)) setSession(restored, false);
  root.addEventListener('online', function () { if (session) schedule(0); });
  root.addEventListener('storage', function (event) {
    if (event.key === sessionKey) { var next = read(sessionKey); if ((!session && next) || (session && (!next || next.uid !== session.uid))) setSession(next, false); else if (session && validSession(next)) session = next; }
    else if (event.key === store.key()) notify();
  });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && session) schedule(0); });
}(window));
