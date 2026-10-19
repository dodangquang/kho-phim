# Nguồn Tủ Phim

Web Mobile 1.0.17, Desktop 1.0.9, TV Web 1.0.15, Samsung 1.0.13, APK Mobile/TV 1.0.6 (code7) và source iOS 1.0.3 (build4) dùng duy nhất danh mục Tủ Phim. Các phiên bản cài đặt cũ cần nâng cấp để nhận thay đổi nguồn.

## Dữ liệu và phát phim

`/source/*` trên Vercel đi qua `api/tuphim.js` và `lib/tuphim.js`. Gateway đọc API công khai `https://api.phimsrv.com/v1` mà website Tủ Phim sử dụng, chuyển dữ liệu sang cấu trúc hiện có của Kho Phim. Không dùng API key, cookie hoặc tài khoản của Tủ Phim; không có đường dự phòng tới nguồn cũ. Trang GitHub Pages và APK dùng chung gateway tại `https://khophimqd.vercel.app/source` để tránh CORS của upstream.

Danh mục hỗ trợ mới cập nhật, phim lẻ (`single` và `movie`), phim bộ, chiếu rạp, thể loại, quốc gia và tìm kiếm. Loại các phim upstream đánh dấu `vipOnly`. Không tạo danh mục Thuyết minh/Lồng tiếng riêng vì upstream bỏ qua bộ lọc đó; lựa chọn âm thanh phụ thuộc server từng phim.

Chỉ tạo link HLS cho tập có `useMedia: true`. Những lựa chọn chỉ có iframe ngoài không được gắn link HLS giả. Gateway đọc cấu hình JSON công khai trong trang embed và giải cách che URL mà trình phát công khai dùng. HLS không có phụ đề ngoài được chuyển hướng302 đến CDN để thiết bị xem tải trực tiếp; tránh đọc trước từ data centre khi CDN trả404 theo vị trí mạng. Với WebVTT ngoài, gateway trả manifest có nhóm phụ đề và URI tuyệt đối. Không chạy JavaScript upstream, không tự giải mã video/DRM và không thay đổi danh tính/Referer để vượt lỗi403. Video và phụ đề được tải trực tiếp từ CDN nguồn; gateway không chuyển tiếp byte video.

Ưu tiên Diamond khi phim có server này, sau đó server có nhiều tập HLS hơn; vẫn giữ các lựa chọn khác. Một số server nguồn trả403 hoặc tải segment chậm. Kho Phim báo lỗi để đổi server; việc thay nguồn không bảo đảm mọi server upstream luôn hoạt động hay tải nhanh. Nhánh ghép phụ đề chưa hỗ trợ HLS có khóa mã hóa. Không sửa hoặc giả điểm IMDb/TMDB; điểm cập nhật cùng dữ liệu phim.

## Lịch sử

Phim mới mang slug `tp--{primarySlug}`. Giữ nguyên dữ liệu lịch sử cũ, kể cả dữ liệu đã đồng bộ Google, nhưng không đưa phim nguồn cũ vào Tiếp tục xem. Lịch sử cũ hiển thị hướng dẫn tìm lại phim và dùng ảnh cục bộ, không tải lại ảnh từ CDN cũ. Không đoán ghép phim chỉ bằng tên/năm; mã phim và cách chia tập của hai nguồn khác nhau. Đồng bộ và quy tắc Firestore không đổi.

## Giới hạn và kiểm tra

Gateway chỉ hỗ trợ GET/HEAD/OPTIONS, giới hạn trang/kích thước/timeout/cache, không nhận URL tùy ý từ client, kiểm tra HTTPS và địa chỉ DNS công khai trước khi đọc manifest. Không chuyển tiếp thông tin xác thực của người dùng.

```sh
node --test tools/tests/tuphim.test.cjs
node docs/tests/source-browser.cjs
node docs/tests/source-browser.cjs --webkit
```

Kiểm tra thật đã nhận được danh mục, thể loại, quốc gia, tìm kiếm, chi tiết và HLS của `tp--ultraman-tiga` trên Diamond [VS]/[LT]. Một số tập Master chỉ có iframe ngoài; Gold của phim mẫu trả403. Kết quả trình duyệt và các kiểm tra thiết bị được ghi riêng trong báo cáo bàn giao, không coi mô phỏng WebKit/AVPlay là xác nhận trên iPhone hay TV thật.

Production Vercel ngày19/10/2026: một lượt thử độc lập mỗi giao diện Mobile/Desktop/TV Web trên Edge, tìm phim qua UI thật, phát mặc định Diamond [VS] và tua±10s đều qua, startup4,7–5,3giây. Không giả dữ liệu, chuyển tiếp API hay dùng profile người dùng. Đây là kết quả phim mẫu; các lượt CDN chậm trước đó vẫn được ghi nhận. APK Mobile/TV1.0.6 đã ký cùng chứng chỉ cũ, xác minh44JUnit, hai build/lint, chữ kýv2/v3, zipalign16KB và SHA256 của byte tải công khai. WGT1.0.13 là unsigned. CI GitHub/iOS còn xếp hàng khi phát hành.

Phân tích trình phát là tĩnh, không thực thi script của nhà cung cấp. Bằng chứng REA snapshot `0ce0b4122324af717eb3a3e50b30dfb23bd1eba1117dd35647e300fe933d771b`, parent evidence `ev_425e5be0e7406b4fb6f8f7d9e41a990adda3b8b170510aed92ae394576bff24f`. Đồ thị ban đầu không đầy đủ do mã làm rối; kết luận về URL/manifest được đối chiếu với phản hồi HTTP và phát thật, không suy ra từ kết quả trace không khớp.
