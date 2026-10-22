# Kho Phim Samsung TV — runtime 1.0.16, WGT 1.0.15

Runtime 1.0.16 thêm thông báo khi mở ứng dụng, dùng chung `docs/announcement.json` với web và Android. Thông báo quảng cáo 9922.com hiện một lần sau khi xác nhận bằng OK/Back; chờ nếu đang mở trình phát. Không cần cài lại WGT 1.0.15. Xem `../ANNOUNCEMENTS.md` để quản lý nội dung.

## Tự động cập nhật từ 1.0.15

Cài [WGT 1.0.15 UNSIGNED](https://github.com/dodangquang/kho-phim/releases/download/samsung-v1.0.15/KhoPhim_Samsung_Tizen_v1.0.15_UNSIGNED.wgt) qua Apps2Samsung một lần, ký bằng profile/chứng chỉ đã dùng cho app cũ. Giữ application ID `X84DodangQ.KhoPhim`, package `X84DodangQ` và khóa lịch sử. Cài cập nhật lên app hiện có; gỡ app có thể mất dữ liệu.

Sau đó app tự kiểm tra khi mở, tải giao diện/trình phát mới trong nền và áp dụng khi mở lại. Cài Đặt có **Kiểm tra cập nhật**, **Áp dụng ngay** và **Khôi phục bản cài sẵn**; điều khiển được bằng remote. Không tự khởi động lại khi đang xem phim; Áp dụng ngay cũng bị chặn trong lúc phát.

Máy chủ cố định `https://khophimqd.vercel.app/samsung/update.json` công bố phiên bản và bundle theo địa chỉ SHA-256. Bộ tải ES5 kiểm tra dung lượng, hash, phiên bản và giao thức shell trước khi lưu. Chỉ thay con trỏ bản đang dùng khi bản mới khởi động thành công. Nếu lỗi hoặc lần khởi động thử bị ngắt, app bỏ qua bundle đó và về bản thành công trước/bản cài sẵn. Mất mạng vẫn mở được bản đã lưu; bộ nhớ đầy không xóa lịch sử để lấy chỗ.

Chức năng này cập nhật HTML/CSS/JavaScript trong cùng ngữ cảnh ứng dụng đóng gói, giữ AVPlay, remote và origin lưu trữ; không chuyển sang trình duyệt hoặc iframe. Cache chỉ dùng khóa riêng `khophim_samsung_ota_v1`. Không xin quyền cài package, không dùng eval/unsafe-inline. SHA-256 kiểm tra tính toàn vẹn; nguồn tin cậy là máy chủ HTTPS cố định của dự án.

Thay đổi `config.xml`, quyền, icon, native shell hay phiên bản giao thức shell vẫn cần WGT ký/cài qua Apps2Samsung. Samsung quy định [Package.install cần quyền platform](https://developer.samsung.com/smarttv/develop/api-references/tizen-web-device-api-references/package-api.html); app sideload thông thường không có quyền này. Đây không phải gói phân phối Samsung Store: [chính sách hosted/external scripts của Store](https://developer.samsung.com/smarttv/develop/faq/hosted-applications.html) yêu cầu làm việc với Samsung Content Manager.

Đã kiểm tra 4 bài unit, 13 tình huống cập nhật qua trình duyệt với CSP thật của gói và 36 kiểm tra giao diện/AVPlay mô phỏng. Chưa xác minh trên TV Samsung thật hoặc ký bằng chứng chỉ TV. Gói có 14 file runtime.

### Phát hành cập nhật giao diện/trình phát

1. Sửa runtime và tăng phiên bản trong `core.js`, `package.json`, nhãn HTML. Khi phát hành WGT, tăng cả `config.xml` và `PACKAGE_VERSION` trong `updater.js`; giữ `SHELL = 1` trừ khi đổi giao thức tải/quyền.
2. Chạy `node tv-samsung-tizen/tools/build-update.cjs`, rồi `npm test` trong `tv-samsung-tizen`. Builder chuẩn hóa LF và tạo `docs/samsung/bundles/<sha256>.json` cùng `update.json`. `.gitattributes` giữ nguyên byte bundle khi checkout.
3. Triển khai cả bundle và manifest cùng một commit. Không sửa nội dung file có hash cũ, giữ bundle cũ cho TV đang tải. Manifest không cache; bundle có địa chỉ bất biến và CORS cho origin của TV.
4. Bản sửa sau rollback phải tăng số phiên bản và có hash mới. Không công bố shell mới cho app cũ trừ khi có WGT tương ứng: app sẽ hướng dẫn cài WGT.

## Lịch sử bản 1.0.14

Bản 1.0.14 chuyển toàn bộ danh mục, tìm kiếm và nguồn phát sang Tủ Phim qua gateway chung. Không còn gọi nguồn phim cũ hay máy chủ dự phòng của nguồn cũ. Chọn nguồn/ngôn ngữ trong danh sách server của từng phim; hai mục Lồng Tiếng và Thuyết Minh có bộ lọc đúng theo nhãn âm thanh, phân trang riêng và ưu tiên server tương ứng khi mở phim.

Tải [WGT 1.0.14 UNSIGNED](https://github.com/dodangquang/kho-phim/releases/download/v1.0.7/KhoPhim_Samsung_Tizen_v1.0.14_UNSIGNED.wgt) trong Release1.0.7; gói gồm12file runtime, cần Apps2Samsung ký/cài.

Lịch sử cũ và khóa lưu trữ được giữ nguyên. Phim từ nguồn cũ dùng ảnh mặc định, không xuất hiện trong Xem tiếp; chọn một mục cũ sẽ mở tìm kiếm với đúng tiêu đề đã lưu để người dùng chọn lại năm/phần phù hợp. ID mới có tiền tố `tp--`, không tự ghép phim chỉ dựa trên tên.

Đã qua 36 kiểm tra giao diện/AVPlay và cú pháp ES5, kiểm tra điểm/XSS, cùng kiểm tra chuyển nguồn/lịch sử trên Edge. Các kiểm tra AVPlay sử dụng mô phỏng; chưa kiểm tra nguồn Tủ Phim trên TV Samsung thật. Gói WGT cần Apps2Samsung ký bằng chứng chỉ của TV trước khi cài.

## Lịch sử bản 1.0.12
Thêm điểm IMDb/TMDB trên thẻ phim và trang chi tiết, kèm nguồn, thang 10 và số lượt đánh giá. Dùng dữ liệu sẵn có trong API, không thêm request từng phim. Không hiển thị 0/10 cho phim chưa có điểm. Điểm thay đổi được nhận khi tải lại dữ liệu sau lần cài bản hỗ trợ này.

Gói [KhoPhim_Samsung_Tizen_v1.0.12_UNSIGNED.wgt](https://github.com/dodangquang/kho-phim/releases/download/v1.0.4/KhoPhim_Samsung_Tizen_v1.0.12_UNSIGNED.wgt) đã phát hành; chứa 12 file runtime, cần Apps2Samsung ký/cài. Giữ ID và khóa lịch sử. Đã qua 36 kiểm tra TV, kiểm tra hiển thị điểm và cú pháp ES5 trên Edge; chưa thử trên TV thật.

## Lịch sử bản 1.0.11

Bản 1.0.11 sửa lỗi tự đóng video sau 25 giây khi đang tạm dừng mà AVPlay gửi sự kiện buffering. Watchdog chỉ theo dõi lúc chuẩn bị/phát, được bật lại khi phát tiếp; tua lúc tạm dừng vẫn giữ trạng thái tạm dừng. Callback của video cũ không thể thay đổi bộ đếm nguồn mới. Đã bỏ yêu cầu dự phòng đến endpoint OPhim trả 404, tránh chờ nguồn đã hỏng khi tải thông tin phim thất bại.

36/36 kiểm tra tích hợp trên Edge đã qua; bài kiểm tra watchdog chứa tám tình huống cho Samsung và nhánh AVPlay của TV Web. JavaScript runtime giữ cú pháp ES5. Gói mới tạo bằng `tools/package.ps1 -Unsigned` có tên `KhoPhim_Samsung_Tizen_v1.0.11_UNSIGNED.wgt`, chỉ chứa 11 file runtime; chưa ký, chưa phát hành lên GitHub và chưa thử trên TV thật. Chi tiết lần kiểm tra mới ở đầu `TEST-RESULTS.md`.

## Ghi chú và hướng dẫn của bản đã phát hành 1.0.10

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
