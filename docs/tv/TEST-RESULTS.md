# TV Web 1.0.10 — kiểm tra trước khi phát hành

17/10/2026. Edge 154.0.4258.62; Chromium 69.0.3494.0 Windows. Các bài kiểm tra chạy trên source trong repo này.

## Web

Các kiểm tra web đã qua:
1. Native web HLS starts without requesting HLS.js and releases video on stop
2. Web HLS lazy load is shared; stale opens cannot start playback and stop destroys the decoder
3. Leaving playback while HLS.js loads cannot restart video
4. Fatal HLS errors close the decoder and show a navigable source error
5. TV web boots with full-width posters, no remote scripts, no AVPlay SDK request and no HLS.js at startup
6. Web MSE fallback loads local HLS.js once and really decodes H.264/AAC video; pause, seek and resume work
7. Leaving real HLS playback releases the media source and restores movie card focus
8. Website links to the single current GitHub Release WGT; all old WGT copies are removed from the repository
9. No browser runtime exceptions in web browsing and real playback

HLS mẫu H.264/AAC lấy từ test-streams.mux.dev và phục vụ cục bộ trong bài kiểm tra; video đã giải mã được, có kích thước hình và currentTime tăng. Dữ liệu media kiểm thử không được đưa vào website hoặc WGT. Kết quả chi tiết: ../../tv-samsung-tizen/tests/results-web-v1.0.10.json.

## Engine cũ và bản cài

- Chromium 69 thật: kiểm tra đủ chiều rộng poster trong 7 trạng thái (trang chủ, hai kệ khi cuộn, focus, danh mục với menu mở/đóng, Xem tiếp và lịch sử); Enter/Space/Return hoạt động, không lỗi runtime. Không chỉ thay User-Agent trên Edge.
- Bản Samsung: 36/36 kiểm tra hồi quy qua, AVPlay được mô phỏng. Runtime và file WGT giữ nguyên bản 1.0.10 đã gửi người dùng.
- Tất cả JavaScript của web, gồm HLS.js light 1.7.3, phân tích cú pháp ES5 thành công.

Chưa kiểm tra TV Web mới trên phần cứng Samsung thật. Khả năng phát nguồn ngoài bài kiểm tra phụ thuộc codec, mạng và CORS của máy chủ phim. Bản WGT dùng AVPlay; browser dùng HLS gốc hoặc HLS.js khi cần.
