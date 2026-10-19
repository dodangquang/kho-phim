/* ES5 on purpose: Samsung TU8100 / Tizen 5.5 / Chromium 69. */
(function (global) {
  'use strict';
  var C = {};
  C.VERSION = '1.0.12';
  C.PAGE_SIZE = 6;
  C.SHELF_HEIGHT = 540;
  C.EPISODE_PAGE_SIZE = 24;
  C.HISTORY_KEY = 'khophim_tv_watch_history';
  C.safeUrl = function (value) {
    var url = String(value || '').replace(/^\s+|\s+$/g, '');
    if (url.indexOf('//') === 0) url = 'https:' + url;
    return /^https?:\/\/[^\s]+$/i.test(url) ? url : '';
  };
  C.image = function (value, domain) {
    if (!value) return 'icon.png';
    var url = C.safeUrl(value);
    if (url) return url;
    if (/^[a-z]+:/i.test(String(value))) return 'icon.png';
    return (C.safeUrl(domain) || 'https://phimimg.com').replace(/\/$/, '') + '/' + String(value).replace(/^\/+/, '');
  };
  C.stream = function (episode) {
    var direct = C.safeUrl(episode.link_m3u8 || episode.linkM3u8);
    if (direct) return direct;
    var embed = String(episode.link_embed || '');
    var match = /[?&]url=([^&]+)/.exec(embed);
    if (match) {
      try {
        direct = C.safeUrl(decodeURIComponent(match[1]));
        if (/\.m3u8(?:[?#]|$)/i.test(direct)) return direct;
      } catch (ignore) {}
    }
    return '';
  };
  C.time = function (ms) {
    var seconds = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
    var hours = Math.floor(seconds / 3600);
    var minutes = Math.floor(seconds / 60) % 60;
    var rest = seconds % 60;
    return (hours ? hours + ':' : '') + (minutes < 10 ? '0' : '') + minutes + ':' + (rest < 10 ? '0' : '') + rest;
  };
  C.list = function (json, displayPage) {
    var data = json.data || json;
    var pagination = (data.params && data.params.pagination) || json.pagination || {};
    var raw = Array.isArray(data.items) ? data.items : [];
    var sourceSize = Number(pagination.totalItemsPerPage) || C.PAGE_SIZE;
    var offset = (((displayPage || 1) - 1) * C.PAGE_SIZE) % sourceSize;
    var items = raw.slice(offset, offset + C.PAGE_SIZE);
    return {
      items: items,
      totalPages: Math.max(1, Math.ceil((Number(pagination.totalItems) || (Number(pagination.totalPages) || 1) * sourceSize) / C.PAGE_SIZE)),
      sourceSize: sourceSize,
      imageDomain: data.APP_DOMAIN_CDN_IMAGE || 'https://phimimg.com'
    };
  };
  C.history = function () {
    try {
      var entries = JSON.parse(global.localStorage.getItem(C.HISTORY_KEY) || '[]');
      if (!Array.isArray(entries)) return [];
      return entries.filter(function (entry) { return entry && typeof entry.slug === 'string'; }).slice(0, 40);
    } catch (ignore) { return []; }
  };
  C.findHistory = function (slug) {
    var list = C.history();
    for (var i = 0; i < list.length; i++) if (list[i].slug === slug) return list[i];
    return null;
  };
  C.save = function (entry) {
    var entries = C.history().filter(function (item) { return item.slug !== entry.slug; });
    entries.unshift(entry);
    try { global.localStorage.setItem(C.HISTORY_KEY, JSON.stringify(entries.slice(0, 40))); } catch (ignore) {}
  };
  /* Each consumer owns one request. Abort plus generation guards prevent stale
     search/detail responses and bound memory. Timeout does not depend on fetch. */
  C.Request = function () { this.xhr = null; this.generation = 0; };
  C.Request.prototype.cancel = function () {
    this.generation++;
    if (this.xhr) { this.xhr.abort(); this.xhr = null; }
  };
  C.Request.prototype.get = function (urls, callback, validate) {
    this.cancel();
    var owner = this;
    var generation = owner.generation;
    var index = 0;
    function attempt() {
      if (generation !== owner.generation) return;
      if (index >= urls.length) { owner.xhr = null; callback(new Error('Không tải được dữ liệu. Kiểm tra kết nối mạng rồi chọn Tải lại.')); return; }
      var xhr = new global.XMLHttpRequest();
      var finished = false;
      owner.xhr = xhr;
      function failed() {
        if (finished || generation !== owner.generation) return;
        finished = true;
        attempt();
      }
      xhr.open('GET', urls[index++], true);
      xhr.timeout = 9000;
      xhr.onload = function () {
        if (finished || generation !== owner.generation) return;
        if (xhr.status < 200 || xhr.status >= 300) { failed(); return; }
        var json;
        try { json = JSON.parse(xhr.responseText); } catch (ignore) { failed(); return; }
        if (!json || typeof json !== 'object' || json.status === false || json.status === 'error' || (validate && !validate(json))) { failed(); return; }
        finished = true;
        owner.xhr = null;
        callback(null, json);
      };
      xhr.onerror = failed;
      xhr.ontimeout = failed;
      try { xhr.send(); } catch (ignore) { failed(); }
    }
    attempt();
  };
  C.Cache = function (limit) { this.limit = limit; this.entries = []; };
  C.Cache.prototype.get = function (key) {
    for (var i = 0; i < this.entries.length; i++) {
      if (this.entries[i].key === key) {
        var entry = this.entries.splice(i, 1)[0];
        if (Date.now() - entry.time > 180000) return null;
        this.entries.unshift(entry);
        return entry.value;
      }
    }
    return null;
  };
  C.Cache.prototype.set = function (key, value) {
    this.entries = this.entries.filter(function (entry) { return entry.key !== key; });
    this.entries.unshift({ key: key, value: value, time: Date.now() });
    this.entries = this.entries.slice(0, this.limit);
  };
  C.Cache.prototype.clear = function () { this.entries = []; };
  global.KhoCore = C;
}(window));
