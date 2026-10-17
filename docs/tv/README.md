# Kho Phim TV Web 1.0.10

Giao diện TV dùng cùng bản tối ưu Samsung 1.0.10: ES5, 6 phim/kệ/trang, cache 48 thumbnail trong phiên, sửa khung poster hẹp trên Chromium 69.

Mở `/tv/` trên website. Browser ưu tiên phát HLS gốc. Nếu thiếu HLS gốc nhưng có Media Source Extensions, app mới tải `vendor/hls.light-1.7.3.min.js` từ chính website và giải phóng trình phát khi thoát video. HLS.js không được tải khi chỉ duyệt phim. Bản cài Samsung trong `/tv-samsung-tizen` dùng AVPlay và không mang thư viện này.

HLS.js là thư viện từ https://github.com/video-dev/hls.js, bản 1.7.3 light; giấy phép ở `vendor/HLS-LICENSE.txt`. API và máy chủ video cần cho phép CORS khi phát qua HLS.js. Video/trình duyệt/codec không tương thích vẫn có thể cần đổi nguồn hoặc dùng bản cài Samsung.

Gói Apps2Samsung hiện tại: [Samsung Tizen 1.0.10](https://github.com/dodangquang/kho-phim/releases/download/v1.0.10/KhoPhim_Samsung_Tizen_v1.0.10.wgt). Đây là WGT chưa ký; công cụ cài cần xử lý chứng chỉ cho TV.

Source và bộ kiểm tra giao diện/AVPlay nằm tại `../../tv-samsung-tizen/`. Bản 1.0.10 đã qua kiểm tra bố cục trên Chromium 69 Windows và hồi quy trên Edge; chưa kiểm tra bản web này trên phần cứng TV Samsung thật.
