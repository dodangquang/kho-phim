# Hướng dẫn cài đặt Kho Phim trên Smart TV LG (webOS)

Smart TV LG sử dụng hệ điều hành webOS (chạy ứng dụng Web App .ipk). Bạn có 2 cách sử dụng:

---

### Cách 1: Sử dụng qua Trình duyệt Web của TV LG (Khuyên dùng - Nhanh nhất)
1. Trên TV LG, mở ứng dụng **Trình duyệt web (Web Browser)** có sẵn.
2. Nhập địa chỉ: `https://dodangquang.github.io/kho-phim/`
3. Nhấn vào menu tuỳ chọn của trình duyệt (biểu tượng 3 chấm) -> Chọn **Thêm vào Màn hình chính (Add to Home)** hoặc **Ghim vào trang chủ**.
4. Biểu tượng Kho Phim sẽ xuất hiện ngay màn hình chủ TV LG.
5. Sử dụng **Magic Remote (chuột bay)** rê trỏ chuột bấm chọn hoặc dùng các phím mũi tên điều hướng (D-pad) để xem phim full màn hình cực kỳ mượt mà!

---

### Cách 2: Cài đặt gói ứng dụng qua webOS Dev Manager (Không cần máy Mac/Linux)
Nếu bạn muốn cài app độc lập vào TV LG:

1. **Bật Developer Mode trên TV LG:**
   - Mở **LG Content Store** trên TV LG, tìm và cài đặt ứng dụng **Developer Mode**.
   - Mở ứng dụng Developer Mode lên và đăng nhập bằng tài khoản LG của bạn (miễn phí).
   - Gạt **Dev Mode Status** sang **ON**.
   - Gạt **Key Server** sang **ON**.
   - Trên màn hình sẽ hiển thị địa chỉ IP của TV và mã Passphrase (6 chữ cái).

2. **Cài đặt qua webOS Dev Manager trên máy tính:**
   - Tải phần mềm mã nguồn mở **webOS Dev Manager** cho Windows từ GitHub:
     `https://github.com/webosbrew/dev-manager-desktop/releases`
   - Mở webOS Dev Manager, chọn **Add Device**:
     - Nhập IP TV và Passphrase hiển thị trên TV.
   - Nhấn **Connect**.
   - Bấm vào mục **Apps** -> **Install** -> Chọn thư mục hoặc gói `KhoPhim_LG_webOS_v1.0.2.zip`.
   - Ứng dụng Kho Phim sẽ xuất hiện trong hàng ứng dụng trên TV LG của bạn!
