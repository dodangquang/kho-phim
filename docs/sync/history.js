(function (root) {
  'use strict';
  var LIMIT = 60;
  function text(value, max) { return typeof value === 'string' ? value.slice(0, max) : ''; }
  function number(value) { value = Number(value); return isFinite(value) && value >= 0 ? Math.min(Math.floor(value), 9007199254740991) : 0; }
  function image(value) { return typeof value === 'string' && /^https:\/\/[^\s<>"']+$/.test(value) ? value.slice(0, 2048) : ''; }
  function normalize(item) {
    if (!item || typeof item !== 'object') return null;
    var slug = text(item.movieSlug || item.slug, 180);
    if (!/^[a-zA-Z0-9_-]{1,180}$/.test(slug)) return null;
    return {
      movieSlug: slug, movieTitle: text(item.movieTitle || item.title || item.name, 300),
      posterUrl: image(item.posterUrl || item.poster || item.poster_url), bannerUrl: image(item.bannerUrl || item.banner || item.thumb_url),
      episodeSlug: text(item.episodeSlug, 180), episodeName: text(item.episodeName, 200),
      serverName: text(item.serverName, 200),
      positionMs: Math.min(31536000000, number(item.positionMs == null ? Number(item.currentTime) * 1000 : item.positionMs)),
      durationMs: Math.min(31536000000, number(item.durationMs == null ? Number(item.duration) * 1000 : item.durationMs)),
      timestamp: Math.max(1, number(item.timestamp || item.updatedAt)), deleted: item.deleted === true
    };
  }
  function later(a, b) {
    if (!a) return b;
    if (a.timestamp !== b.timestamp) return a.timestamp > b.timestamp ? a : b;
    if (a.deleted !== b.deleted) return a.deleted ? a : b;
    function key(row) { return [row.movieTitle, row.posterUrl, row.bannerUrl, row.episodeSlug, row.episodeName, row.serverName, String(row.positionMs), String(row.durationMs)].join('\u0000'); }
    return key(a) >= key(b) ? a : b;
  }
  function merge(left, right, clearedAt) {
    var map = Object.create(null);
    left.concat(right).forEach(function (raw) {
      var item = normalize(raw);
      if (item && item.timestamp > clearedAt) map[item.movieSlug] = later(map[item.movieSlug], item);
    });
    return Object.keys(map).map(function (key) { return map[key]; }).sort(function (a, b) {
      return b.timestamp - a.timestamp || (a.movieSlug < b.movieSlug ? -1 : 1);
    }).slice(0, 240);
  }
  function Store(storage, now) { this.storage = storage; this.now = now || Date.now; this.owner = 'guest'; }
  Store.prototype.key = function () { return 'khophim_sync_v1_' + this.owner; };
  Store.prototype.read = function () {
    try {
      var state = JSON.parse(this.storage.getItem(this.key()) || 'null');
      if (state && Array.isArray(state.rows) && state.dirty && typeof state.dirty === 'object') {
        var dirty = Object.create(null);
        Object.keys(state.dirty).forEach(function (slug) { dirty[slug] = number(state.dirty[slug]); }); state.dirty = dirty;
        state.clearedAt = number(state.clearedAt); state.rows = merge([], state.rows, state.clearedAt); return state;
      }
    } catch (ignore) {}
    return { rows: [], dirty: Object.create(null), clearedAt: 0, clearDirty: false };
  };
  Store.prototype.write = function (state) {
    var kept = Object.create(null); state.rows.forEach(function (row) { kept[row.movieSlug] = true; });
    Object.keys(state.dirty).forEach(function (slug) { if (!kept[slug]) delete state.dirty[slug]; });
    this.storage.setItem(this.key(), JSON.stringify(state));
  };
  Store.prototype.history = function () { return this.read().rows.filter(function (row) { return !row.deleted; }).slice(0, LIMIT); };
  Store.prototype.save = function (raw) {
    var item = normalize(raw); if (!item) return;
    item.timestamp = this.now();
    var state = this.read(); state.rows = merge(state.rows, [item], state.clearedAt);
    state.dirty[item.movieSlug] = item.timestamp; this.write(state);
  };
  Store.prototype.remove = function (slug) { this.save({ movieSlug: slug, deleted: true }); };
  Store.prototype.clear = function () {
    this.write({ rows: [], dirty: {}, clearedAt: this.now(), clearDirty: true });
  };
  Store.prototype.switchOwner = function (owner, importGuest) {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(owner)) throw new Error('Invalid history owner');
    this.owner = 'guest'; var guest = importGuest ? this.history() : [];
    this.owner = owner; var state = this.read();
    state.rows = merge(state.rows, guest, state.clearedAt);
    guest.forEach(function (item) { state.dirty[item.movieSlug] = item.timestamp; });
    this.write(state);
    if (importGuest && owner !== 'guest') {
      this.owner = 'guest'; this.write({ rows: [], dirty: {}, clearedAt: 0, clearDirty: false }); this.owner = owner;
    }
  };
  Store.prototype.reconcile = function (rows, clearedAt) {
    var state = this.read(); state.clearedAt = Math.max(state.clearedAt, number(clearedAt));
    state.rows = merge(state.rows, rows, state.clearedAt);
    rows.forEach(function (raw) { var row = normalize(raw); if (row && state.dirty[row.movieSlug] <= row.timestamp) delete state.dirty[row.movieSlug]; });
    Object.keys(state.dirty).forEach(function (slug) { if (state.dirty[slug] <= state.clearedAt) delete state.dirty[slug]; });
    if (number(clearedAt) >= state.clearedAt) state.clearDirty = false;
    this.write(state);
  };
  Store.prototype.ack = function (slug, timestamp) {
    var state = this.read(); if (state.dirty[slug] === timestamp) { delete state.dirty[slug]; this.write(state); }
  };
  Store.prototype.migrate = function (lists) {
    if (this.storage.getItem('khophim_sync_migrated_v1')) return;
    var state = this.read(); lists.forEach(function (list) { if (Array.isArray(list)) state.rows = merge(state.rows, list, -1); });
    this.write(state); this.storage.setItem('khophim_sync_migrated_v1', '1');
  };
  function escape(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var api = { normalize: normalize, merge: merge, later: later, Store: Store, escape: escape };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.KhoHistory = api;
}(typeof window !== 'undefined' ? window : this));
