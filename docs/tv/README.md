# Kho Phim TV Web 1.0.15

Danh mục, tìm kiếm và nguồn phát sử dụng Tủ Phim qua `https://khophimqd.vercel.app/source`. Không có fallback sang nguồn phim cũ. Chọn nguồn/ngôn ngữ trong danh sách server của từng phim; các danh sách riêng Thuyết Minh/Lồng Tiếng không còn được gửi tới API.

Lịch sử Google tiếp tục đồng bộ với web và APK bằng schema cũ. Phim cũ không bị xóa, được ẩn khỏi Xem tiếp và dùng ảnh mặc định trong Lịch sử. Chọn phim cũ sẽ mở tìm kiếm với tiêu đề đã lưu; người dùng tự chọn đúng năm/phần trên nguồn mới. Slug phim mới có tiền tố `tp--` để không trùng nguồn cũ.

JavaScript TV giữ ES5, sáu phim/kệ/trang, cache 48 thumbnail trong phiên. Cache danh mục được phân tách theo nguồn. Thư viện HLS.js 1.7.3 light chỉ được tải từ chính website khi bắt đầu phát. TV/Safari ưu tiên HLS gốc; PC có MSE dùng HLS.js. Giấy phép ở `vendor/HLS-LICENSE.txt`.

Đã kiểm tra chuyển nguồn/lịch sử, đồng bộ tài khoản, chọn server và tương tác phát/tua trên Edge; luồng giao diện cũng qua WebKit. Phát HLS thật trên WebKit cài trên Windows chưa kiểm chứng được vì runtime này không có HLS gốc hay MediaSource. Chưa kiểm tra trên iPhone hoặc phần cứng TV thật. Server video có thể chậm hoặc từ chối kết nối; dùng Quay lại để chọn nguồn khác khi app báo lỗi.