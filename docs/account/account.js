(function () {
  'use strict';
  var button = document.getElementById('google-signin'), status = document.getElementById('auth-status');
  var params = new URLSearchParams(location.hash.slice(1)), pairing = params.get('pair') ? { pair: params.get('pair'), key: params.get('key') || '' } : null;
  // Pairing keys stay out of network requests, referrers, analytics and browser history.
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  var requested = new URLSearchParams(location.search).get('return') || '../?mode=mobile';
  var back; try { back = new URL(requested, location.href); } catch (ignore) { back = new URL('../?mode=mobile', location.href); }
  var appRoot = new URL('../', location.href).pathname;
  if (back.origin !== location.origin || [appRoot, appRoot + 'desktop/', appRoot + 'tv/'].indexOf(back.pathname) === -1) back = new URL('../?mode=mobile', location.href);
  document.getElementById('return-link').href = back.href;
  if (pairing) {
    var info = document.getElementById('pair-info'); info.hidden = false;
    info.textContent = 'Liên kết thiết bị ' + pairing.pair.slice(0, 8) + '. Chỉ tiếp tục nếu bạn vừa mở mã QR trên thiết bị của mình.';
  }
  if (!KhoSync.enabled || !window.firebase) {
    button.textContent = 'Đăng nhập chưa được bật'; status.textContent = 'Chức năng tài khoản đang được thiết lập.'; return;
  }
  firebase.initializeApp(KHO_SYNC_CONFIG);
  var auth = firebase.auth(); auth.languageCode = 'vi';
  auth.setPersistence(firebase.auth.Auth.Persistence.NONE).then(function () {
    button.disabled = false; button.textContent = pairing ? 'Tiếp tục với Google và liên kết thiết bị' : 'Tiếp tục với Google';
  }).catch(function () { status.textContent = 'Không chuẩn bị được đăng nhập. Hãy tải lại trang.'; });
  button.onclick = function () {
    button.disabled = true; status.textContent = 'Đang mở đăng nhập Google…';
    var provider = new firebase.auth.GoogleAuthProvider(); provider.setCustomParameters({ prompt: 'select_account' });
    // Open the popup directly from the tap so Safari preserves the user gesture.
    auth.signInWithPopup(provider).then(function (result) {
      var credential = result.credential;
      if (!credential || !credential.idToken) throw new Error('Thiếu thông tin đăng nhập Google.');
      return KhoSync.acceptGoogle(credential.idToken, result.user.uid).then(function (session) {
        if (session.uid !== result.user.uid) { KhoSync.signOut(); throw new Error('Tài khoản đăng nhập không khớp.'); }
        if (pairing) return KhoPairing.claim(pairing, credential.idToken, session.uid).then(function () {
          status.textContent = 'Đã xác nhận tài khoản. Thiết bị sẽ kết nối trong vài giây.'; button.textContent = 'Đã liên kết thiết bị'; pairing = null;
        });
        status.textContent = 'Đăng nhập thành công. Đang trở về Kho Phim…'; location.replace(back.href);
      });
    }).catch(function (e) {
      status.textContent = /popup-closed|cancelled-popup/.test(e.code || '') ? 'Bạn đã đóng đăng nhập. Có thể thử lại bất cứ lúc nào.' : /popup-blocked/.test(e.code || '') ? 'Trình duyệt chặn cửa sổ đăng nhập. Cho phép cửa sổ bật lên rồi nhấn lại nút Google.' : 'Chưa đăng nhập hoặc liên kết được. Hãy kiểm tra kết nối và thử lại; mã QR có thể đã hết hạn.';
      button.disabled = false;
    });
  };
}());
