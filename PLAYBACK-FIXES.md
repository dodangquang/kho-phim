# Sửa phát phim — 18/10/2026

## Web mobile 1.0.13 và desktop 1.0.6

Safari ưu tiên HLS gốc; Chrome/Edge tải HLS.js 1.7.3 từ website khi bắt đầu xem. Tua và resume đợi metadata/vùng seekable, giữ vị trí khi phục hồi và hủy callback khi đổi tập/đóng video. Desktop bỏ script CDN `@latest` chặn tải trang, giữ vị trí cùng trạng thái tạm dừng khi đổi HLS → embed → HLS, khôi phục đúng server/tập và lưu tiến trình trong lúc xem. Điều khiển của trang không phủ lên điều khiển iframe.

Kiểm chứng: 15 ca unit lifecycle; kiểm thử giao diện Safari mô phỏng và desktop trên Edge; ba phim mobile và một phim desktop phát thật, tua ±10 và tua xa; desktop đổi nguồn khi pause khôi phục chính xác vị trí. Safari mô phỏng không thay thế việc kiểm trên iPhone thật.

## Android Mobile và Android TV 1.0.3/code4

Giữ nguyên slug có năm/số phần, không bỏ hậu tố số gây mở nhầm phim. Chỉ chuyển URL HLS hợp lệ cho player; giải mã HLS trong embed, từ chối HTML. Resume khớp server và tập. Đổi tập lưu tiến trình cũ, reset thời gian và retry dùng thời gian tập mới. TV không tua tới sentinel âm khi duration chưa biết; bổ sung thử lại/chọn server khác.

## iOS native

Controller mới sở hữu AVPlayer và observer, gỡ observer theo đúng player, giải phóng player trước khi đổi tập và chặn callback cũ. Timeline reset theo tập; resume/tua kiểm tra thời gian hữu hạn, tải sẵn và server. Có báo lỗi/thử lại. Chính sách URL giữ đúng phim và giải mã HLS trong embed. Năm XCTest Foundation và build iOS được chạy qua workflow macOS; Windows không có công cụ build iOS.

## Samsung 1.0.11, TV Web 1.0.12 và LG

AVPlay không đặt timeout lỗi khi người xem tạm dừng, kể cả khi nhận callback buffering/tua. Callback của nguồn cũ không thể đóng nguồn mới. TV Web đợi seekable và giữ pause/vị trí khi chuyển HLS gốc sang MSE. LG launcher sử dụng TV Web nên nhận cùng sửa khi website triển khai.

Kiểm chứng: 36 kiểm tra tích hợp Samsung, tám tình huống AVPlay/watchdog trên hai build, 11 kiểm tra player web; ba nguồn TV Web phát thật trên Edge với resume/pause/tua. WGT unsigned được đối chiếu đủ 11 file runtime với source. Chưa cài thử trên phần cứng Samsung/LG.

## Server và bản phát hành

PhimAPI và 59/59 nguồn HLS lấy mẫu trước khi sửa trả playlist/segment thành công. Điều này không đảm bảo mọi phim luôn hoạt động. Bỏ các yêu cầu OPhim và URL config GitHub đã trả 404; không thêm tên miền dự phòng chưa kiểm chứng. Không ghi đè các gói cũ hay phát hành lại dưới nhãn phiên bản cũ.

Chạy kiểm tra web từ thư mục gốc:

```sh
node --test docs/tests/mobile-player.test.cjs
node tv-samsung-tizen/tests/player-timing.cjs
node tv-samsung-tizen/tests/web-player.cjs
# Cần Playwright và Edge; NODE_PATH trỏ tới node_modules nếu cài ở thư mục khác.
node docs/tests/mobile-browser.cjs
node docs/tests/desktop-browser.cjs
node tv-samsung-tizen/tests/regression.cjs
# Hai lệnh browser hỗ trợ --live khi có mạng tới API/CDN.
```
