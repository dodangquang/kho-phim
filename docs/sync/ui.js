(function (root) {
  'use strict';
  if (!root.KhoSync || !root.KhoSync.enabled) return;
  var sync = root.KhoSync;
  Array.prototype.forEach.call(document.querySelectorAll('[data-sync-panel]'), function (panel) {
    panel.className += ' sync-panel';
    var tv = panel.getAttribute('data-sync-panel') === 'tv';
    panel.innerHTML = '<strong>Tài khoản &amp; lịch sử</strong><p data-sync-name></p><p data-sync-status class="sync-status" role="status" aria-live="polite"></p><div class="sync-actions"><button type="button" class="sync-button tv-btn tv-btn-secondary" data-sync-login>Đăng nhập Google</button><button type="button" class="sync-button tv-btn tv-btn-secondary" data-sync-now>Đồng bộ ngay</button></div><div data-sync-pair class="sync-pairing" hidden><div class="sync-qr"></div><div><p>Quét bằng điện thoại để đăng nhập Google.</p><p>Mã chỉ dùng một lần, hết hạn sau 5 phút.</p><a class="sync-pair-link" rel="noreferrer noopener" target="_blank"></a></div></div>';
    var login = panel.querySelector('[data-sync-login]'), name = panel.querySelector('[data-sync-name]'), status = panel.querySelector('[data-sync-status]'), now = panel.querySelector('[data-sync-now]'), pair = panel.querySelector('[data-sync-pair]');
    var receiver = null, pairing = false, pairMessage = '';
    function render() {
      var user = sync.user(); name.textContent = user ? user.name : 'Đăng nhập cùng Google trên web và APK để tiếp tục xem ở thiết bị khác.';
      status.textContent = pairMessage || sync.status();
      login.textContent = user ? 'Đăng xuất' : pairing ? 'Hủy liên kết' : 'Đăng nhập Google';
      now.disabled = !user;
    }
    login.onclick = function () {
      if (sync.user()) { if (receiver) receiver.cancel(); pairing = false; pair.hidden = true; pairMessage = ''; sync.signOut(); return; }
      if (!tv) { sync.signIn(); return; }
      if (pairing) { receiver.cancel(); pairing = false; pair.hidden = true; pairMessage = ''; render(); return; }
      pairing = true; pairMessage = 'Đang tạo mã QR…'; render();
      receiver = new root.KhoPairing.Receiver(root.KHO_SYNC_CONFIG, function (value) {
        if (value.url) {
          var qr = root.qrcode(0, 'M'); qr.addData(value.url); qr.make(); panel.querySelector('.sync-qr').innerHTML = qr.createSvgTag({ scalable: true, margin: 0 });
          var link = pair.querySelector('a'); link.href = value.url; link.textContent = 'Mở liên kết thiết bị ' + value.label;
          pair.hidden = false; pairMessage = 'Chờ xác nhận trên điện thoại…';
        } else { pairing = false; pair.hidden = true; pairMessage = value.error || ''; }
        render();
      });
      receiver.start().catch(function () { pairing = false; pairMessage = 'Không tạo được mã QR. Kiểm tra kết nối và thử lại.'; render(); });
    };
    now.onclick = function () { pairMessage = ''; sync.sync(); };
    sync.onChange(render); render();
  });
}(window));
