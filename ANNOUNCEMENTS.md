# Thông báo khi mở Kho Phim

`docs/announcement.json` là nguồn văn bản dùng chung cho Web Mobile/Desktop/TV, runtime Samsung từ 1.0.16 và APK Mobile/Android TV từ 1.0.8. Phục vụ qua HTTPS tại `https://khophimqd.vercel.app/announcement.json`, CORS công khai và `Cache-Control: no-store`.

- `active: false` tắt thông báo. Tăng `id` khi có thông báo mới cần hiện lại.
- `id`: 1–80 ký tự chữ/số/gạch ngang/gạch dưới; `title` tối đa 120 ký tự; `message` tối đa 1200 ký tự. Toàn bộ phản hồi tối đa 16 KiB, thời gian chờ 5 giây.
- Chỉ hiển thị văn bản, không hỗ trợ HTML, liên kết, mã hay tác vụ từ feed.
- “Đã hiểu”, Escape/Back lưu ID đã xem trong khóa riêng; các trang web cùng origin dùng chung xác nhận. APK lưu riêng cho từng ứng dụng. Không đổi dữ liệu lịch sử/tài khoản.
- Khi trình phát mở, thông báo chờ đến khi đóng trình phát. APK ưu tiên hộp cập nhật phiên bản trước. Lỗi mạng/feed không hợp lệ không chặn khởi động.
- Web nhận mã nhận thông báo khi tải lại trang. Samsung WGT 1.0.15 tải runtime 1.0.16 trong nền, áp dụng ở lần mở tiếp theo; không cần thay WGT. APK cũ cần cập nhật một lần lên 1.0.8 để nhận feed; những thông báo sau chỉ cần sửa feed.

Thông báo ngày 22/10/2026 chỉ xác nhận lọc các đoạn quảng cáo 9922.com đã nhận diện trong nguồn tương thích. Phạm vi bộ lọc và các trường hợp giữ nguyên luồng phát được ghi trong `TUPHIM-SOURCE.md`; không cam kết xóa quảng cáo ở mọi nguồn hay quảng cáo được in trực tiếp vào hình phim.

Kiểm tra: `node docs/tests/announcement-browser.cjs` thử bốn giao diện, Samsung qua shell OTA/CSP thật với AVPlay mô phỏng; `--webkit` thử ba giao diện web bằng WebKit. Kiểm tra một lần sau xác nhận, ID mới, văn bản chứa thẻ HTML, feed hỏng/mất mạng, remote Back và chờ trình phát. Hai dự án Android có kiểm tra giới hạn thông báo và được biên dịch release; chưa thử trên điện thoại/TV vật lý.
