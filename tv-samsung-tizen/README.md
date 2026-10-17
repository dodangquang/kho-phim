# Hướng dẫn cài đặt Kho Phim trên Smart TV Samsung (Tizen OS)

Smart TV Samsung sử dụng hệ điều hành Tizen OS (chạy ứng dụng Web App .wgt). Bạn có 2 cách sử dụng:

---

### Cách 1: Sử dụng qua Trình duyệt Samsung Internet (Khuyên dùng - Không cần máy tính)
1. Trên TV Samsung, mở ứng dụng **Internet** (Trình duyệt web Samsung Internet có sẵn).
2. Nhập địa chỉ: `https://dodangquang.github.io/kho-phim/`
3. Trong trình duyệt, nhấn menu tùy chọn (biểu tượng 3 dấu gạch hoặc cài đặt) -> Chọn **Thêm vào màn hình chính (Add to Home Screen)** hoặc **Ghim vào Quick Access**.
4. Sử dụng remote phím điều hướng (Lên / Xuống / Trái / Phải / OK / Return) để chọn phim và xem full màn hình thoải mái!

---

### Cách 2: Cài đặt gói ứng dụng độc lập (.wgt) qua Developer Mode
Nếu muốn cài thành một app hiển thị riêng biệt trong danh sách ứng dụng của TV Samsung:

1. **Bật Developer Mode trên TV Samsung:**
   - Mở màn hình ứng dụng (**Apps**) trên TV.
   - Bấm liên tiếp các phím số `1` `2` `3` `4` `5` trên remote TV.
   - Một bảng thông báo Developer Mode hiện lên:
     - Gạt nút sang **ON**.
     - Nhập địa chỉ IP của máy tính của bạn (máy tính và TV phải kết nối chung 1 mạng Wi-Fi).
   - Tắt TV và bật lại để chế độ Developer Mode có hiệu lực.

2. **Cài đặt qua Tizen Device Manager trên PC:**
   - Cài đặt công cụ **Tizen Studio** hoặc **Tizen Device Manager** từ trang chủ của Samsung (developer.samsung.com/smarttv).
   - Kết nối đến địa chỉ IP của TV Samsung.
   - Chọn file `KhoPhim_Samsung_Tizen_v1.0.2.wgt` và nhấn **Install**.
