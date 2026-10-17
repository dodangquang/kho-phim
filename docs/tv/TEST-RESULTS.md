# TV Web 1.0.11 — sửa phát HLS trên PC

17/10/2026. Edge 154.0.4258.62 trên Windows.

## Lỗi đã tái hiện

Bản 1.0.10 dùng canPlayType(HLS) để chọn phát gốc. Edge trả maybe nhưng không mở được playlist phim đầu trang; HLS.js không được gọi. Bài kiểm tra HLS mẫu trước đó đã ép canPlayType về rỗng để kiểm tra đường MSE, nên không bắt được trường hợp browser trả dương tính nhưng phát gốc thất bại.

## Sửa và xác minh

- PC có MSE ưu tiên HLS.js dù canPlayType báo hỗ trợ HLS gốc.
- TV/Safari giữ phát gốc trước; nếu phát gốc lỗi thì thử MSE một lần, không lặp vô hạn.
- Vẫn chỉ tải thư viện khi xem phim và hủy decoder khi quay lại; ảnh/cache/bố cục không đổi.

12/12 kiểm tra web đã qua, dùng giá trị capability thật của Edge trong kiểm tra tích hợp:

1. Desktop Edge selects HLS.js despite a positive native canPlayType response
2. TV keeps native HLS first and switches once to MSE on native failure without retry loops
3. Safari retains native HLS even when MediaSource is available
4. Native web HLS starts without requesting HLS.js and releases video on stop
5. Web HLS lazy load is shared; stale opens cannot start playback and stop destroys the decoder
6. Leaving playback while HLS.js loads cannot restart video
7. Fatal HLS errors close the decoder and show a navigable source error
8. TV web boots with full-width posters, no remote scripts, no AVPlay SDK request and no HLS.js at startup
9. Web MSE fallback loads local HLS.js once and really decodes H.264/AAC video; pause, seek and resume work
10. Leaving real HLS playback releases the media source and restores movie card focus
11. Website links to the single current GitHub Release WGT; all old WGT copies are removed from the repository
12. No browser runtime exceptions in web browsing and real playback

## Nguồn phim thật

Thử bốn phim đầu trang bằng API và CDN thật, không mock phản hồi phim/video và không sửa canPlayType:

- Phàm Nhân Tu Tiên: video 1920×1080, currentTime tăng, nguồn MSE.
- Ngọc Điệm Thu: video 1920×1080, currentTime tăng, nguồn MSE.
- Không Thể Thay Thế: video 1920×1080, currentTime tăng, nguồn MSE.
- Mị Ảnh Thần Bộ (Phần 1): video 1920×804, currentTime tăng, nguồn MSE.

Đã thử tạm dừng/tua/phát tiếp ở phim đầu, quay lại và giải phóng nguồn ở cả bốn phim; không có runtime exception. Dữ liệu chi tiết: ../../tv-samsung-tizen/tests/results-real-pc-v1.0.11.json.

Tất cả JavaScript runtime vẫn phân tích cú pháp ES5. Bản WGT Samsung vẫn 1.0.10 và GitHub Releases vẫn chỉ có một WGT. Không khẳng định mọi phim/codec/CDN đều hoạt động; chưa thử web 1.0.11 trên TV Samsung thật.
