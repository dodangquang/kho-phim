(function (root) {
  'use strict';
  function error(message, status) { var result = new Error(message); result.status = status; return result; }
  function request(url, method, data, token, form) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest(); xhr.open(method || 'GET', url); xhr.timeout = 15000;
      xhr.setRequestHeader('Content-Type', form ? 'application/x-www-form-urlencoded' : 'application/json');
      if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
      xhr.onload = function () {
        var body; try { body = JSON.parse(xhr.responseText || '{}'); } catch (ignore) { reject(error('Phản hồi đồng bộ không hợp lệ.', xhr.status)); return; }
        if (xhr.status < 200 || xhr.status >= 300) { reject(error(body.error && body.error.message || 'Không kết nối được dịch vụ đồng bộ.', xhr.status)); return; }
        resolve(body);
      };
      xhr.onerror = xhr.ontimeout = function () { reject(error('Đang ngoại tuyến. Lịch sử vẫn được lưu trên thiết bị.', 0)); };
      xhr.send(data == null ? null : form ? Object.keys(data).map(function (key) { return encodeURIComponent(key) + '=' + encodeURIComponent(data[key]); }).join('&') : JSON.stringify(data));
    });
  }
  function encode(data) {
    var fields = {};
    Object.keys(data).forEach(function (key) {
      var v = data[key]; fields[key] = typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? { integerValue: String(Math.floor(v)) } : { stringValue: String(v) };
    });
    return fields;
  }
  function decode(doc) {
    var result = {};
    Object.keys(doc.fields || {}).forEach(function (key) {
      var v = doc.fields[key];
      result[key] = v.stringValue != null ? v.stringValue : v.integerValue != null ? Number(v.integerValue) : v.booleanValue != null ? v.booleanValue : v.timestampValue;
    }); return result;
  }
  function Transport(config, getToken) {
    this.config = config; this.getToken = getToken;
    this.cursors = {};
    this.base = 'https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(config.projectId) + '/databases/(default)/documents/';
  }
  Transport.prototype.auth = function (operation, data) {
    return request('https://identitytoolkit.googleapis.com/v1/accounts:' + operation + '?key=' + encodeURIComponent(this.config.apiKey), 'POST', data);
  };
  Transport.prototype.google = function (idToken) {
    return this.auth('signInWithIdp', { postBody: 'id_token=' + encodeURIComponent(idToken) + '&providerId=google.com', requestUri: 'https://' + this.config.authDomain, returnSecureToken: true, returnIdpCredential: false });
  };
  Transport.prototype.refresh = function (refreshToken) {
    return request('https://securetoken.googleapis.com/v1/token?key=' + encodeURIComponent(this.config.apiKey), 'POST', { grant_type: 'refresh_token', refresh_token: refreshToken }, null, true);
  };
  Transport.prototype.call = function (path, method, data) {
    var self = this; return this.getToken().then(function (token) { return request(self.base + path, method, data, token); });
  };
  Transport.prototype.get = function (path) { return this.call(path).catch(function (e) { if (e.status === 404) return null; throw e; }); };
  Transport.prototype.readHistory = function (uid) {
    var self = this, path = 'users/' + encodeURIComponent(uid) + '/';
    var query = { from: [{ collectionId: 'history' }], orderBy: [{ field: { fieldPath: 'timestamp' }, direction: 'DESCENDING' }], limit: 120 };
    if (this.cursors[uid]) {
      query.orderBy = [{ field: { fieldPath: 'updatedAt' }, direction: 'ASCENDING' }];
      query.where = { fieldFilter: { field: { fieldPath: 'updatedAt' }, op: 'GREATER_THAN', value: { timestampValue: new Date(this.cursors[uid] - 1).toISOString() } } };
    }
    return Promise.all([
      this.call(path.slice(0, -1) + ':runQuery', 'POST', { structuredQuery: query }),
      this.get(path + 'meta/history')
    ]).then(function (parts) {
      var rows = parts[0].filter(function (row) { return row.document; }).map(function (row) { return decode(row.document); });
      rows.forEach(function (row) { var time = Date.parse(row.updatedAt); if (isFinite(time)) self.cursors[uid] = Math.max(self.cursors[uid] || 0, time); });
      return { rows: rows, clearedAt: parts[1] ? Number(decode(parts[1]).clearedAt) || 0 : 0 };
    });
  };
  Transport.prototype.mergeDocument = function (path, incoming, pick, attempt, serverStamp) {
    var self = this;
    return this.get(path).then(function (existing) {
      var previous = existing ? decode(existing) : null;
      if (serverStamp && previous) previous = root.KhoHistory.normalize(previous);
      var chosen = pick(previous, incoming);
      if (!chosen || (existing && JSON.stringify(chosen) === JSON.stringify(previous))) return chosen;
      var precondition = existing ? '?currentDocument.updateTime=' + encodeURIComponent(existing.updateTime) : '?currentDocument.exists=false';
      var write;
      if (serverStamp) {
        write = self.getToken().then(function (token) {
          return request(self.base.slice(0, -1) + ':commit', 'POST', { writes: [{ update: { name: self.base.replace('https://firestore.googleapis.com/v1/', '') + path, fields: encode(chosen) }, currentDocument: existing ? { updateTime: existing.updateTime } : { exists: false }, updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }] }] }, token);
        }).then(function () { return chosen; });
      } else write = self.call(path + precondition, 'PATCH', { fields: encode(chosen) }).then(function (doc) { return decode(doc); });
      return write.catch(function (e) {
        if ((e.status === 409 || e.status === 412) && (attempt || 0) < 3) return self.mergeDocument(path, incoming, pick, (attempt || 0) + 1, serverStamp);
        throw e;
      });
    });
  };
  Transport.prototype.upsert = function (uid, row) {
    return this.mergeDocument('users/' + encodeURIComponent(uid) + '/history/' + encodeURIComponent(row.movieSlug), row, root.KhoHistory.later, 0, true);
  };
  Transport.prototype.clear = function (uid, time) {
    return this.mergeDocument('users/' + encodeURIComponent(uid) + '/meta/history', { clearedAt: time }, function (a, b) { return { clearedAt: Math.max(a ? a.clearedAt : 0, b.clearedAt) }; });
  };
  Transport.request = request; Transport.encode = encode; Transport.decode = decode;
  root.KhoSyncTransport = Transport;
}(window));
