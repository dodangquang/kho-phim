# Kho Phim Samsung TV 1.0.10 — poster phủ đủ chiều ngang thẻ

Bản sửa tiếp từ 1.0.9 dành cho Samsung UA55TU8100KXXV / Tizen 5.5. Người dùng đã xác nhận 1.0.9 chạy mượt nhưng gửi ảnh chụp cho thấy poster bị hẹp, để trống một dải bên phải trong thẻ phim.

## Nguyên nhân và thay đổi

Đã tái hiện đúng hiện tượng trên **Chromium 69.0.3494.0 thật trên Windows**: nội dung thẻ rộng 246 px nhưng khung poster chỉ rộng 161 px. Chromium cũ tạo hộp nội dung bên trong nút `button`; với bố cục flex và chiều rộng phần trăm, hộp poster có thể co theo nội dung tiêu đề. Kiểm tra trên Edge mới ở bản trước không phát hiện lỗi này.

- Thẻ phim và Xem tiếp dùng phần tử thường có `role="button"` và `tabindex="0"`, tránh bố trí nội dung đặc thù của nút native.
- Thẻ poster và vùng thông tin dùng bố cục block; khung ảnh phủ đủ chiều ngang, không phụ thuộc độ dài tiêu đề hoặc focus.
- Giữ bấm OK/Enter, Return, chuột và phím Space; thẻ vẫn nhận và khôi phục focus sau khi đóng thông tin phim.
- Giữ giao diện, 6 phim/kệ/trang và toàn bộ cơ chế cache 48 thumbnail / tối đa 16 MiB từ 1.0.9.

Trong lần kiểm tra bằng Chromium 69, cả chiều ngang thẻ, khung poster và canvas đều đạt **246 px** tại trang chủ. Kiểm tra thêm danh mục với menu mở/đóng, thẻ Xem tiếp và lịch sử đều qua. Không dùng thay User-Agent trên Edge để thay cho lần kiểm tra này.

Tham khảo lỗi bố trí button/flex của Chromium: https://issues.chromium.org/issues/40510039. Kết quả đo cụ thể của app được ghi trong `tests/results-legacy-v1.0.10.json`.

## Cài cập nhật

1. Tải [KhoPhim_Samsung_Tizen_v1.0.10.wgt](https://github.com/dodangquang/kho-phim/releases/download/v1.0.10/KhoPhim_Samsung_Tizen_v1.0.10.wgt), không giải nén.
2. Trong Apps2Samsung, chọn TV và Custom WGT như cách đã cài bản trước.
3. Cài cập nhật bằng chứng chỉ/profile cũ để giữ lịch sử; gói UNSIGNED là đầu vào cho công cụ ký/cài.
4. Mở app, kiểm tra số phiên bản **1.0.10** trong menu hoặc Cài Đặt.

Giữ application ID `X84DodangQ.KhoPhim` và khóa lịch sử cũ. Nếu công cụ báo xung đột chứng chỉ, dùng lại profile đã cài bản trước; gỡ app có thể mất lịch sử.

## Kiểm chứng và giới hạn

- 36/36 kiểm tra tự động trên Edge 154 đã qua: ES5, danh mục/tìm kiếm, cache, phân trang, focus, Enter/Space/Return và AVPlay mô phỏng.
- Chromium 69.0.3494.0: tái hiện lỗi ở 1.0.9 rồi kiểm tra 7 trạng thái bố cục ở 1.0.10, đo chiều rộng khung/canvas và chụp ảnh màn hình với poster thật từ fixture lưu sẵn; không có lỗi runtime trong các luồng đã chạy.
- `posters.js`, `player.js`, `home.js`, `style.css` và icon giữ nguyên từ 1.0.9. Thay đổi runtime chỉ nằm ở cấu trúc thẻ/xử lý focus của `app.js`, vài quy tắc bố cục trong `tv-compat.css` và metadata phiên bản.

Chưa chạy **1.0.10 trên TV Samsung thật**, chưa ký bằng chứng chỉ TV và không đo FPS/RAM trên TV. Chromium 69 trên Windows tái hiện được lỗi bố cục nhưng không thay cho việc thử trên phần cứng Tizen.

Cache vẫn là cache trong phiên: tối đa 48 thumbnail, 16 MiB điểm ảnh cache (không phải toàn bộ RAM app), 2 lượt tải poster đồng thời. Cuộn quay lại ảnh còn trong cache không cần tải lại. Đóng app hoặc vượt giới hạn cache có thể cần tải lại; lần tải đầu phụ thuộc mạng/CDN.

## Phát triển

HTML/CSS/JavaScript đóng gói cục bộ trong WGT, phát video bằng Samsung AVPlay. TV không cần Node/npm. Giao diện/icon từ https://github.com/dodangquang/kho-phim, snapshot e20cdbb; không tự đặt giấy phép mới cho tài nguyên gốc.

Kiểm tra trên máy có Node.js và Microsoft Edge:

```powershell
npm install
npm test
```

Tạo WGT chưa ký:

```powershell
.\tools\package.ps1 -Unsigned -OutputDirectory .\release
```

Hoặc ký bằng Tizen Studio với Samsung TV certificate profile chứa DUID TV:

```powershell
.\tools\package.ps1 -SecurityProfile "TEN_PROFILE_CUA_BAN" -OutputDirectory .\release
```

WGT chỉ chứa 11 file runtime. Tài liệu, test, dữ liệu kiểm chứng, công cụ Chromium và chứng chỉ không được đưa vào WGT.
