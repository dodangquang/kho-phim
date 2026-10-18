# Kho Phim - Đa Nền Tảng (Android TV • Android Mobile • iOS)

Ứng dụng xem phim đa nền tảng tốc độ cao, hỗ trợ nguồn phát HLS đa server (Vietsub, Thuyết minh, Lồng tiếng), chặn quảng cáo độc hại và đồng bộ lịch sử xem.

## 📱 Các Phiên Bản

| Nền tảng | Thư mục mã nguồn | File cài đặt sẵn có | Trạng thái |
| :--- | :--- | :--- | :--- |
| **Samsung TV / Apps2Samsung 1.0.10** | `/tv-samsung-tizen` | [Tải WGT 1.0.10](https://github.com/dodangquang/kho-phim/releases/download/v1.0.10/KhoPhim_Samsung_Tizen_v1.0.10.wgt) | ✅ Giao diện cục bộ, AVPlay, cache poster |
| **TV Web 1.0.11** | `/docs/tv` | [Mở TV Web](https://dodangquang.github.io/kho-phim/tv/) | ✅ Sửa phát phim trên Edge/Chrome PC; 6 phim/kệ, cache poster |
| **Android TV (Vers 1)** | `/tv` | `releases/KhoPhim_TV_v1.0.0.apk` | ✅ Hoàn thành & Tối ưu remote D-pad |
| **Android Mobile** | `/mobile-android` | `releases/KhoPhim_Mobile_v1.0.0.apk` | ✅ Màn dọc, xoay ngang khi phát |
| **Web Mobile 1.0.12 (iPhone/Android)** | `/docs` | [Trang Web Kho Phim](https://khophimqd.vercel.app/?mode=mobile) | ✅ HLS gốc Safari, tua ±10s, khôi phục luồng |
| **iOS (iPhone/iPad Xcode)** | `/mobile-ios` | SwiftUI Xcode Project | ✅ Native SwiftUI & AVPlayer |

## 🌟 Tính Năng Chính
- **Màn hình dọc & Toàn màn hình:** Lướt phim ở màn hình dọc. Trên web mobile, bấm nút toàn màn hình khi video đã sẵn sàng; hỗ trợ tua 10s, kéo thanh thời gian, chọn tập và đổi nguồn.
- **Hệ thống nguồn phát linh hoạt:** Hỗ trợ đa server m3u8 (Server VIP, Server Phụ, Thuyết Minh, Lồng Tiếng, Vietsub).
- **Tự động lưu lịch sử xem:** Ghi nhớ chính xác thời gian đã xem của từng tập phim và cho phép tiếp tục xem chỉ với một chạm.
- **Chặn quảng cáo (AdBlocker):** Tự động loại bỏ popup, chuyển hướng độc hại và banner gây giật lag.
- **Quản lý tên miền thông minh (Domain Manager):** Tự động kiểm tra và chuyển sang tên miền dự phòng nếu web chính bị chặn DNS.

## 🚀 Tải File Cài Đặt (Releases)
Các file APK dựng sẵn nằm trong thư mục `releases/`:
- `KhoPhim_TV_v1.0.0.apk`: Bản dành cho Smart TV / TV Box / Android TV.
- `KhoPhim_Mobile_v1.0.0.apk`: Bản dành cho điện thoại Android.

## Samsung TV 1.0.10 và TV Web 1.0.11

Bản Samsung đóng gói giao diện cục bộ, phát bằng AVPlay; bản web dùng cùng giao diện tối ưu tại `/tv/`. Giữ 6 phim mỗi kệ/trang, cache tối đa 48 thumbnail và sửa poster bị hẹp trên Chromium 69. Chi tiết kiểm tra và cách cài ở [tv-samsung-tizen/README.md](tv-samsung-tizen/README.md).

TV Web 1.0.11 ưu tiên HLS.js trên PC có Media Source Extensions, kể cả khi Edge báo hỗ trợ HLS gốc. TV/Safari vẫn ưu tiên HLS gốc và có thêm bước thử HLS.js nếu phát gốc lỗi. Đã thử phát bốn phim đầu trang trên Edge bằng API/CDN thật.

Gói Samsung hiện hành duy nhất được phát hành trong GitHub Releases: `KhoPhim_Samsung_Tizen_v1.0.10.wgt` (UNSIGNED, dành cho Apps2Samsung ký/cài). Link tải trên website trỏ thẳng tới file này.

## Web Mobile 1.0.12

Safari ưu tiên HLS gốc và chỉ tải HLS.js 1.7.3 cục bộ khi cần dự phòng. Trình phát chờ vùng thời gian có thể tua trước khi tiếp tục xem hoặc tua ±10s, hủy tác vụ cũ khi đổi tập/đóng video, và thử khôi phục tại vị trí đang xem khi luồng bị kẹt. Thoát toàn màn hình iPhone giữ nguyên phiên phát. Lịch sử được lưu theo tiến trình, khi tạm dừng hoặc rời trang; không dựng lại kệ phim trong lúc xem.

Kiểm tra từ thư mục gốc repo:

```sh
node --test docs/tests/mobile-player.test.cjs
# Cần Playwright và Microsoft Edge, hoặc đặt PLAYWRIGHT_CHANNEL=chrome.
node docs/tests/mobile-browser.cjs
# Kiểm tra thêm API/CDN thật; cần truy cập mạng.
node docs/tests/mobile-browser.cjs --live
```

Kiểm tra tự động mô phỏng vòng đời HLS gốc của Safari và thử luồng thật bằng Edge/HLS.js. Vẫn cần xác nhận trên iPhone thật (Safari thường và PWA), gồm tiếp tục xem, tua tiến/lùi nhiều lần, tạm dừng khi tua và thoát toàn màn hình.
