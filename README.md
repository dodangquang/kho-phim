# Kho Phim - Đa Nền Tảng (Android TV • Android Mobile • iOS)

Ứng dụng xem phim đa nền tảng tốc độ cao, hỗ trợ nguồn phát HLS đa server (Vietsub, Thuyết minh, Lồng tiếng), chặn quảng cáo độc hại và đồng bộ lịch sử xem.

## 📱 Các Phiên Bản

| Nền tảng | Thư mục mã nguồn | File cài đặt sẵn có | Trạng thái |
| :--- | :--- | :--- | :--- |
| **Samsung TV / Apps2Samsung 1.0.11** | `/tv-samsung-tizen` | Bản sửa cần đóng gói/ký; [WGT cũ 1.0.10](https://github.com/dodangquang/kho-phim/releases/download/v1.0.10/KhoPhim_Samsung_Tizen_v1.0.10.wgt) | Sửa watchdog khi tạm dừng |
| **TV Web 1.0.12 / LG webOS launcher** | `/docs/tv` | [Mở TV Web](https://dodangquang.github.io/kho-phim/tv/) | Đợi seekable, giữ pause khi khôi phục nguồn |
| **Android TV 1.0.3** | `/tv` | Bản sửa cần build từ source | Giữ đúng phim/server; tua an toàn |
| **Android Mobile 1.0.3** | `/mobile-android` | Bản sửa cần build từ source | Không dùng thời gian tập cũ khi thử lại |
| **Web Mobile 1.0.13 (iPhone/Android)** | `/docs` | [Trang Web Kho Phim](https://khophimqd.vercel.app/?mode=mobile) | ✅ HLS gốc Safari, tua ±10s, khôi phục luồng |
| **iOS (iPhone/iPad Xcode)** | `/mobile-ios` | SwiftUI Xcode Project | ✅ Native SwiftUI & AVPlayer |
| **Web Desktop 1.0.6** | `/docs/desktop` | [Mở Desktop](https://khophimqd.vercel.app/desktop/) | Giữ vị trí/pause khi đổi nguồn; HLS.js cục bộ tải khi cần |

## 🌟 Tính Năng Chính
- **Màn hình dọc & Toàn màn hình:** Lướt phim ở màn hình dọc. Trên web mobile, bấm nút toàn màn hình khi video đã sẵn sàng; hỗ trợ tua 10s, kéo thanh thời gian, chọn tập và đổi nguồn.
- **Hệ thống nguồn phát linh hoạt:** Hỗ trợ đa server m3u8 (Server VIP, Server Phụ, Thuyết Minh, Lồng Tiếng, Vietsub).
- **Tự động lưu lịch sử xem:** Ghi nhớ chính xác thời gian đã xem của từng tập phim và cho phép tiếp tục xem chỉ với một chạm.
- **Chặn quảng cáo (AdBlocker):** Tự động loại bỏ popup, chuyển hướng độc hại và banner gây giật lag.
- **Nguồn dữ liệu:** ưu tiên PhimAPI; Android vẫn có đường dự phòng từ tên miền do người dùng chọn. Đã bỏ URL cấu hình tên miền và endpoint OPhim trả 404.

## 🚀 Tải File Cài Đặt (Releases)
Các file trong `releases/` là bản cũ, chưa chứa các sửa phát phim hiện tại:
- `KhoPhim_TV_v1.0.0.apk`: Bản dành cho Smart TV / TV Box / Android TV.
- `KhoPhim_Mobile_v1.0.0.apk`: tên file cũ ghi 1.0.0 nhưng metadata bên trong là 1.0.2/code3. Không dùng tên file này để xác định phiên bản.

Hai ZIP LG 1.0.2/1.0.3 cũ có cùng nội dung launcher 1.0.3, mở TV Web trên GitHub Pages. Sửa TV Web được áp dụng khi website được triển khai; không cần sửa lại launcher để nhận các sửa player này.

Chi tiết thay đổi và phạm vi kiểm chứng: [PLAYBACK-FIXES.md](PLAYBACK-FIXES.md). Các số phiên bản ở bảng trên mô tả source trong nhánh hiện tại; link website chỉ có thay đổi sau khi nhánh được triển khai.

## Samsung TV 1.0.10 và TV Web 1.0.11

Bản Samsung đóng gói giao diện cục bộ, phát bằng AVPlay; bản web dùng cùng giao diện tối ưu tại `/tv/`. Giữ 6 phim mỗi kệ/trang, cache tối đa 48 thumbnail và sửa poster bị hẹp trên Chromium 69. Chi tiết kiểm tra và cách cài ở [tv-samsung-tizen/README.md](tv-samsung-tizen/README.md).

TV Web 1.0.11 ưu tiên HLS.js trên PC có Media Source Extensions, kể cả khi Edge báo hỗ trợ HLS gốc. TV/Safari vẫn ưu tiên HLS gốc và có thêm bước thử HLS.js nếu phát gốc lỗi. Đã thử phát bốn phim đầu trang trên Edge bằng API/CDN thật.

Gói Samsung hiện hành duy nhất được phát hành trong GitHub Releases: `KhoPhim_Samsung_Tizen_v1.0.10.wgt` (UNSIGNED, dành cho Apps2Samsung ký/cài). Link tải trên website trỏ thẳng tới file này.

## Web Mobile 1.0.13

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
