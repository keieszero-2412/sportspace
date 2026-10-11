# Kiểm tra điện thoại, ảnh và giá sân trên Supabase

Ngày 11/10/2026, khoảng 00:42 Asia/Bangkok. Kiểm tra chỉ đọc project
`dzpbnvpqkwsjlvdxwwub`: 1.912 Facilities, 7.377 Courts, 400 PricingRules.
Không truy cập Firebase, không cập nhật database hoặc thay đổi giao diện.

## Kết luận

**Chưa thể coi dữ liệu hiện tại là chính xác.** Supabase là nguồn vận hành ưu tiên,
nhưng “mới hơn” hoặc “đã có trên database” không chứng minh dữ liệu đúng thực tế.

### Điện thoại

- 1.911 số có định dạng hợp lệ; 1 số không hợp lệ/placeholder.
- 1.848 bản ghi qua kiểm tra metadata `phone_status=sourced`, URL HTTPS và số
  trong nguồn khớp số hiển thị. Đây chỉ là kiểm tra cấu trúc, không xác minh chủ số.
- 63 số hợp lệ thiếu metadata nguồn đáp ứng điều kiện hiển thị.
- **1.798 sân dùng cùng số `0598370497`**: dấu hiệu rủi ro rất lớn, không được coi
  là hotline thật của từng sân chỉ dựa vào nhãn `sourced`.
- Tổng cộng 1.818 sân thuộc 10 nhóm số lặp. Các nhóm nhỏ có thể là sân cùng chủ,
  chưa đủ bằng chứng để khẳng định tất cả số lặp đều sai.
- Mẫu Master Bros lưu số trên và dẫn tới [Sporta](https://www.sporta.vn/san/master-bros-indoor-pickleball-facility),
  nhưng trang công khai hiện yêu cầu đăng nhập để xem số. Vì vậy nguồn truy cập
  công khai trong lần kiểm tra này không xác minh được số đang lưu.
- Không gọi điện, đăng nhập website ngoài hoặc khẳng định số nào đang hoạt động.

### Ảnh

- 1.912 URL đúng cấu trúc; điều này không xác nhận HTTP thành công hoặc đúng sân.
- **1.844 ảnh Wikimedia minh họa chung (96,44%)**, không phải ảnh riêng của các
  cơ sở tương ứng. Ví dụ ảnh bóng đá Bloomington, Indiana dùng cho 1.131 sân.
- Chỉ 16 URL hiện tại khớp ảnh ứng viên trong manifest tên/địa chỉ cục bộ; 1.896
  URL không khớp manifest. Không khớp không tự động có nghĩa sai; ảnh ứng viên
  cũng chưa phải ảnh được chủ sân xác nhận hoặc có giấy phép sử dụng.
- Mẫu Giảng Võ Club vẫn dùng URL tên file ảnh bể bơi; Volley Vibes dùng ảnh có
  tên Ngọc Vũ; HTL và Wessie Haus dùng ảnh/bài tổng hợp, chưa có bằng chứng riêng.
- Không kiểm tra HTTP/ảnh trực quan toàn bộ URL, không xác nhận bản quyền.

### Giá

- 1.887 sân có chuỗi giá chứa số; 25 sân chưa có giá số.
- Bộ nguồn cục bộ có giá đã đối chiếu cho 216 sân: 6 chuỗi giá khớp khoảng giá
  nguồn, **210 chuỗi khác khoảng giá tham khảo**. Đây không phải kết luận 210
  bảng giá của chủ sân chắc chắn sai, vì nguồn tham khảo có thể khác thời điểm.
- 1.676 sân hiển thị giá số nhưng chưa có nguồn giá đã duyệt trong bộ đối chiếu.
- Trong 216 sân có nguồn, 74 sân chỉ có nguồn không phải giá thuê một sân/giờ;
  không được tự gắn `/h` cho giá theo người, lượt, buổi, suất hoặc gói.
- Ví dụ Master Bros đang lưu 120.000–220.000đ/h, trong khi
  [ShopVNB](https://shopvnb.com/san-pickleball-master-bros.html) nêu 100.000–250.000đ/h.
  My Dink 5 cũng lưu 120.000–220.000đ/h, còn
  [nguồn](https://shopvnb.com/san-pickleball-my-dink-5.html) nêu 150.000–230.000đ/h.
  Hai trang đều lưu ý giá tùy giờ và cần liên hệ sân, không dùng làm giá checkout.
- Cả 7.377 Courts có ít nhất một trường giá. 623 sân con có nguồn tham khảo thuê
  theo giờ; 6.754 chưa có nguồn theo giờ trong bộ đối chiếu. Chưa xác minh bảng
  giá theo khung giờ/ngày và quyền phê duyệt của chủ sân. PricingRules chỉ được
  kiểm kê số lượng; không coi số lượng 400 là bằng chứng giá đúng.

## Hướng xử lý đề xuất (chưa thực hiện)

1. Rà soát 1.798 số lặp và nguồn; chưa xác minh thì không gắn nhãn hotline thật.
2. Thay ảnh minh họa bằng ảnh đúng cơ sở đã có bằng chứng và quyền sử dụng, hoặc
   dùng placeholder trung tính; không tự chọn ảnh đầu tiên tìm được.
3. Tách giá tham khảo khỏi giá booking. Giữ giá do chủ sân xác nhận theo đơn vị,
   khung giờ và ngày áp dụng; không tự ghi đè bằng nguồn web hoặc Firebase.

Chi tiết từng ID: `data_export/venue-data-audit-issues.json`.
Tổng hợp và mẫu hiện tại: `data_export/venue-data-audit-summary.json`.
Script: `scripts/audit-supabase-venue-data.mjs`, dùng kết nối Postgres read-only.
Chỉ kiểm tra cú pháp script; không sửa mã ứng dụng nên không chạy lại build.
