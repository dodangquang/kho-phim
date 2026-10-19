(function (root) {
  'use strict';
  function base64(bytes) { return btoa(String.fromCharCode.apply(null, bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function unbase64(value) { var raw = atob(value.replace(/-/g, '+').replace(/_/g, '/')); return new Uint8Array(raw.split('').map(function (c) { return c.charCodeAt(0); })); }
  function random(size) { var bytes = new Uint8Array(size); root.crypto.getRandomValues(bytes); return bytes; }
  function key(bytes, usage) { return root.crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, [usage]); }
  function encrypt(value, secret) {
    var iv = random(12);
    return key(unbase64(secret), 'encrypt').then(function (k) {
      return root.crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, k, new TextEncoder().encode(JSON.stringify(value)));
    }).then(function (data) { return { payload: base64(new Uint8Array(data)), iv: base64(iv) }; });
  }
  function decrypt(value, secret) {
    return key(unbase64(secret), 'decrypt').then(function (k) {
      return root.crypto.subtle.decrypt({ name: 'AES-GCM', iv: unbase64(value.iv) }, k, unbase64(value.payload));
    }).then(function (data) { return JSON.parse(new TextDecoder().decode(data)); });
  }
  function supported() { return !!(root.crypto && root.crypto.subtle && root.TextEncoder && root.TextDecoder); }
  function Receiver(config, onChange) { this.config = config; this.onChange = onChange; this.epoch = 0; this.timer = null; this.transport = null; this.path = null; }
  Receiver.prototype.cancel = function () {
    this.epoch++; clearTimeout(this.timer);
    if (this.transport && this.path) this.transport.call(this.path, 'DELETE').catch(function () {});
    this.transport = null; this.path = null;
  };
  Receiver.prototype.start = function () {
    this.cancel(); var self = this, epoch = this.epoch, sessionId, secret, expiresAt;
    if (!supported()) return Promise.reject(new Error('Trình duyệt này chưa hỗ trợ liên kết an toàn. Hãy dùng bản web mới hoặc APK.'));
    sessionId = base64(random(16)); secret = base64(random(32)); expiresAt = Date.now() + 300000;
    return root.KhoSync.transport.auth('signUp', { returnSecureToken: true }).then(function (anonymous) {
      if (epoch !== self.epoch) return;
      var transport = new root.KhoSyncTransport(self.config, function () { return Promise.resolve(anonymous.idToken); });
      var path = 'pairings/' + sessionId;
      self.transport = transport; self.path = path;
      var fields = { ownerUid: { stringValue: anonymous.localId }, expiresAt: { timestampValue: new Date(expiresAt).toISOString() } };
      var name = 'projects/' + self.config.projectId + '/databases/(default)/documents/' + path;
      return root.KhoSyncTransport.request(transport.base.slice(0, -1) + ':commit', 'POST', {
        writes: [{ update: { name: name, fields: fields }, currentDocument: { exists: false }, updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }] }]
      }, anonymous.idToken).then(function () {
        if (epoch !== self.epoch) { transport.call(path, 'DELETE').catch(function () {}); return; }
        var url = self.config.accountUrl + '#pair=' + sessionId + '&key=' + secret;
        self.onChange({ url: url, label: sessionId.slice(0, 8), expiresAt: expiresAt });
        function poll() {
          if (epoch !== self.epoch) return;
          if (Date.now() >= expiresAt) { self.cancel(); self.onChange({ error: 'Mã QR đã hết hạn. Chọn đăng nhập để tạo mã mới.' }); return; }
          transport.get(path).then(function (doc) {
            if (epoch !== self.epoch) return;
            if (!doc) throw new Error('Liên kết đã đóng. Hãy tạo mã mới.');
            var value = root.KhoSyncTransport.decode(doc);
            if (!value.payload) { self.timer = setTimeout(poll, 3000); return; }
            return decrypt(value, secret).then(function (credential) {
              if (epoch !== self.epoch) return;
              if (!credential.googleIdToken || credential.uid !== value.senderUid) throw new Error('Thông tin liên kết không hợp lệ.');
              return root.KhoSync.acceptPairedGoogle(credential.googleIdToken, value.senderUid).then(function () {
                if (epoch !== self.epoch) return; self.cancel(); self.onChange({ complete: true });
              });
            });
          }).catch(function (e) {
            if (epoch !== self.epoch) return;
            if (e.status === 0) self.timer = setTimeout(poll, 5000);
            else { self.cancel(); self.onChange({ error: 'Không liên kết được. Hãy tạo mã mới và thử lại.' }); }
          });
        }
        poll();
      });
    });
  };
  // Claim uses the Firebase session, never the Google token, for Firestore auth.
  function claimAuthenticated(params, credential, uid) {
    var transport = root.KhoSync.transport;
    return transport.getToken().then(function (firebaseToken) {
      var original = root.KhoSyncTransport.request;
      // Build the request explicitly instead of mutating the shared transport.
      if (!/^[a-zA-Z0-9_-]{22}$/.test(params.pair) || !/^[a-zA-Z0-9_-]{43}$/.test(params.key)) throw new Error('Liên kết không hợp lệ.');
      var path = 'pairings/' + params.pair;
      return transport.get(path).then(function (doc) {
        if (!doc) throw new Error('Mã QR đã hết hạn hoặc bị hủy.');
        var value = root.KhoSyncTransport.decode(doc);
        if (value.payload || Date.parse(value.expiresAt) <= Date.now()) throw new Error('Mã QR đã được dùng hoặc hết hạn.');
        return encrypt({ googleIdToken: credential, uid: uid }, params.key).then(function (encrypted) {
          var fields = { ownerUid: { stringValue: value.ownerUid }, createdAt: { timestampValue: value.createdAt }, expiresAt: { timestampValue: value.expiresAt }, senderUid: { stringValue: uid }, payload: { stringValue: encrypted.payload }, iv: { stringValue: encrypted.iv } };
          return original(transport.base.slice(0, -1) + ':commit', 'POST', { writes: [{ update: { name: doc.name, fields: fields }, currentDocument: { updateTime: doc.updateTime }, updateTransforms: [{ fieldPath: 'claimedAt', setToServerValue: 'REQUEST_TIME' }] }] }, firebaseToken);
        });
      });
    });
  }
  root.KhoPairing = { Receiver: Receiver, claim: claimAuthenticated, encrypt: encrypt, decrypt: decrypt, supported: supported };
}(window));
