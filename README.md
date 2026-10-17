# Kho Phim - Đa Nền Tảng (Android TV • Android Mobile • iOS)

Ứng dụng xem phim đa nền tảng tốc độ cao, hỗ trợ nguồn phát HLS đa server (Vietsub, Thuyết minh, Lồng tiếng), chặn quảng cáo độc hại và đồng bộ lịch sử xem.

## 📱 Các Phiên Bản

| Nền tảng | Thư mục mã nguồn | File cài đặt sẵn có | Trạng thái |
| :--- | :--- | :--- | :--- |
| **Samsung TV / Apps2Samsung 1.0.10** | `/tv-samsung-tizen` | [Tải WGT 1.0.10](https://github.com/dodangquang/kho-phim/releases/download/v1.0.10/KhoPhim_Samsung_Tizen_v1.0.10.wgt) | ✅ Giao diện cục bộ, AVPlay, cache poster |
| **TV Web 1.0.11** | `/docs/tv` | [Mở TV Web](https://dodangquang.github.io/kho-phim/tv/) | ✅ Sửa phát phim trên Edge/Chrome PC; 6 phim/kệ, cache poster |
| **Android TV (Vers 1)** | `/tv` | `releases/KhoPhim_TV_v1.0.0.apk` | ✅ Hoàn thành & Tối ưu remote D-pad |
| **Android Mobile** | `/mobile-android` | `releases/KhoPhim_Mobile_v1.0.0.apk` | ✅ Màn dọc, xoay ngang khi phát |
| **Web App (iPhone/iPad/Web)** | `/docs` | [Trang Web Kho Phim](https://dodangquang.github.io/kho-phim/) | ✅ Web App tối ưu iPhone, Safari PWA |
| **iOS (iPhone/iPad Xcode)** | `/mobile-ios` | SwiftUI Xcode Project | ✅ Native SwiftUI & AVPlayer |

## 🌟 Tính Năng Chính
- **Màn hình dọc & Xoay ngang tự động:** Lướt phim ở màn hình dọc; khi bấm xem phim, player tự động xoay ngang toàn màn hình (Landscape) với đầy đủ điều khiển chạm (tua 10s, kéo slider, chọn tập, đổi server).
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
