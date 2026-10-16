# PhimMoi TV - Ứng Dụng Android TV Chặn Quảng Cáo

Ứng dụng xem phim trực tuyến tối ưu hóa riêng cho **Android TV / Google TV / Android TV Box**, khai thác trực tiếp nội dung từ nguồn `phimmoic.info` với tính năng **chặn 100% quảng cáo** và **điều khiển mượt mà bằng Remote D-Pad**.

---

## 🎯 Tính Năng Nổi Bật

1. **Chặn sạch quảng cáo (Ad-Free 100%)**:
   - Bóc tách luồng phát trực tiếp (`.m3u8`) từ SSR Hydration của website mà không chạy bất kỳ mã JavaScript/quảng cáo nào.
   - Không popup, không nhảy tab trình duyệt, không banner che màn hình.
   - Tích hợp sẵn `AdBlockInterceptor` lọc domain quảng cáo và tracker.

2. **Giao diện chuẩn 10-Foot UI cho Android TV**:
   - Tương thích 100% với Remote D-Pad (Lên, Xuống, Trái, Phải, OK, Back).
   - Thẻ phim tự động phóng to `1.08x` với hiệu ứng viền vàng cam khi nhận Focus.
   - Thanh điều hướng trên cùng: **Trang Chủ**, **Phim Lẻ**, **Phim Bộ**, **Chiếu Rạp**, **Tìm Kiếm**.

3. **Trình phát Video Media3 / ExoPlayer**:
   - Tự động nạp danh sách server (K - Vietsub, K - Thuyết Minh, V - Vietsub...).
   - Tua nhanh / lùi (10 giây) mượt mà bằng D-Pad Trái / Phải.
   - Tự động gợi ý và chuyển sang tập tiếp theo khi hết tập.
   - Giao diện điều khiển OSD tự động ẩn sau 5 giây để không làm phiền trải nghiệm xem phim.

---

## 📦 Vị Trí File Cài Đặt (APK)

File APK đã được biên dịch thành công sẵn sàng sử dụng:
* **Đường dẫn**: `app/build/outputs/apk/debug/app-debug.apk`
* **Dung lượng**: ~19.6 MB
* **Hỗ trợ**: Android 7.0 (API 24) đến Android 15 (API 35).

---

## 🚀 Hướng Dẫn Cài Đặt Lên Android TV

### Cách 1: Cài đặt qua USB / Thẻ nhớ
1. Copy file `app-debug.apk` vào USB.
2. Cắm USB vào Android TV / TV Box.
3. Trên TV, mở ứng dụng quản lý file (như **X-plore** hoặc **File Commander**) và bấm vào file `.apk` để cài đặt.

### Cách 2: Cài đặt không dây qua ứng dụng "Send Files to TV"
1. Cài ứng dụng **Send Files to TV** trên cả điện thoại và Android TV.
2. Gửi file `app-debug.apk` từ máy sang TV.
3. Cài đặt trực tiếp trên TV.

### Cách 3: Cài đặt trực tiếp qua mạng Wi-Fi bằng ADB
1. Bật **Developer Options** và **ADB Debugging** trên Android TV.
2. Kết nối TV cùng mạng Wi-Fi và xem địa chỉ IP của TV (ví dụ: `192.168.1.50`).
3. Mở terminal trên máy tính và chạy lệnh:
   ```bash
   adb connect 192.168.1.50:5555
   adb install -r app/build/outputs/apk/debug/app-debug.apk
   ```

---

## 🛠️ Cấu Trúc Dự Án

```
phimmoi-tv/
├── app/
│   ├── src/main/
│   │   ├── AndroidManifest.xml          # Khai báo LEANBACK_LAUNCHER cho TV
│   │   └── java/com/phimmoitv/app/
│   │       ├── MainActivity.kt          # Quản lý điều hướng & Back button
│   │       ├── data/
│   │       │   ├── Models.kt            # MovieItem, EpisodeSource, Detail
│   │       │   └── PhimMoiRepository.kt # Bộ bóc tách HTML & JSON m3u8
│   │       ├── network/
│   │       │   ├── AdBlockInterceptor.kt# Lọc tracker & domain quảng cáo
│   │       │   └── NetworkModule.kt     # Cấu hình OkHttpClient tối ưu
│   │       └── ui/
│   │           ├── components/          # TvCard, TvButton, NavigationRail
│   │           ├── home/HomeScreen.kt   # Hero Banner + Danh mục trượt
│   │           ├── detail/DetailScreen.kt# Chi tiết, chọn Server & tập
│   │           ├── player/PlayerScreen.kt# ExoPlayer + D-Pad Remote controls
│   │           └── search/SearchScreen.kt# Tìm kiếm phim & từ khóa gợi ý
│   └── build.gradle.kts
├── settings.gradle.kts
└── gradle.properties
```
