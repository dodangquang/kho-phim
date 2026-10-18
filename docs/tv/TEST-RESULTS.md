# TV Web 1.0.12 — 18/10/2026

11/11 kiểm tra player web đã qua. Bốn tình huống mới kiểm tra xem tiếp khi vùng seekable chưa sẵn sàng, nhiều lần tua lúc tạm dừng, callback sẵn sàng của nguồn cũ và đổi từ HLS gốc sang HLS.js mà vẫn giữ vị trí/trạng thái tạm dừng. Bộ watchdog dùng mã runtime của cả Samsung và TV Web cũng qua tám tình huống; bộ tích hợp Samsung qua 36/36 kiểm tra trên Edge 154.0.4258.62. Tất cả bảy file JavaScript runtime của TV Web phân tích cú pháp ES5.

Dữ liệu: `../../tv-samsung-tizen/tests/results-web-v1.0.12.json`. Các kiểm tra native HLS và AVPlay ở trên dùng môi trường mô phỏng để điều khiển chính xác thứ tự sự kiện; chưa thử trên Safari/iPhone hay TV thật.

Đã chạy thêm ba nguồn phim thật qua player runtime 1.0.12 trên Edge, không sửa capability, playlist hay video: Mục Thần Ký Vietsub tập 01, Mục Thần Ký Thuyết Minh tập 91 và Sát Thủ Về Vườn 2026. Cả ba giải mã video, xem tiếp từ 30 giây, tạm dừng, tua +10/-10 giây, phát tiếp và giải phóng HLS/source khi thoát đều đạt; không có runtime exception hoặc lỗi player. Yêu cầu phân đoạn bị hủy khi tua/thoát là hành vi bình thường. Dữ liệu: `../../tv-samsung-tizen/tests/results-real-pc-v1.0.12.json`. Kiểm tra này dùng trang tối giản tải nguyên các file runtime player/HLS để cô lập phát video; không thay thế kiểm tra toàn bộ giao diện trên thiết bị thật. Kết quả phim thật của 1.0.11 phía dưới là dữ liệu lịch sử.

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
