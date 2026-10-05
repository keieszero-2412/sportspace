# Sửa luồng xác thực và hồ sơ — 05/10/2026

## Nguyên nhân đã xác nhận

- Supabase REST trả `PGRST205` khi giao diện hồ sơ đọc `Bookings` và `CredibilityEvents`: hai bảng chưa tồn tại.
- `Matches` chỉ có `id` và `raw_data`; truy vấn cột `joinedUsers`/`createdAt` ở cấp bảng sai schema. Adapter `watch` cũ còn bỏ qua toán tử `array-contains`.
- Hồ sơ khởi chạy cả ba truy vấn khi mở, dùng chung lỗi và loading; nút thử lại chỉ chạy lại bookings.
- Nút tải lịch sử cũ gọi `listBookings`, một action Edge Function chưa triển khai.
- URL Postgres trong `.env` trỏ pooler vùng `ap-southeast-1`, trong khi project đã liên kết dùng `ap-southeast-2`. Kết nối cũ trả lỗi tenant/user not found.
- Luồng auth cũ phụ thuộc khởi tạo hồ sơ; kết quả hồ sơ rỗng có thể xóa trạng thái đăng nhập hợp lệ.

## Thay đổi

- Migration `20261005010000_add_profile_history.sql` bổ sung hai bảng, indexes và RLS. Người dùng chỉ đọc lịch sử của mình; chủ sân được đọc đơn thuộc sân mình. Client không được tự ghi đơn/điểm uy tín.
- Migration đã áp dụng và ghi nhận trong lịch sử migration của project `dzpbnvpqkwsjlvdxwwub`. Không nhập, sửa hay xóa bản ghi nghiệp vụ.
- `.env` cục bộ đã sửa host/port theo project liên kết, giữ nguyên mật khẩu. Không đưa credentials vào Git.
- `profileData.js` lọc Matches bằng JSON containment, trả các trường từ `raw_data`, phân trang bookings trực tiếp qua PostgREST với cursor thời gian + id, bỏ qua phản hồi cũ/sau unmount.
- Mỗi tab hồ sơ chỉ tải khi mở, có trạng thái lỗi và thử lại riêng. Lỗi quyền/schema vẫn báo lỗi, không biến thành lịch sử rỗng.
- Phiên Auth độc lập với việc tải hồ sơ; email xác nhận có redirect về web hiện tại; bổ sung giao diện cập nhật mật khẩu khi quay về từ email recovery.
- Edge Function lưu hồ sơ qua API Supabase thay vì phụ thuộc pooler. Đây là thay đổi mã nguồn, cần deploy Edge Function để áp dụng trên server.

## Kiểm chứng

```powershell
npm.cmd run test:profile
npm.cmd run test:profile:browser
npm.cmd run test:auth
npm.cmd test
npm.cmd run test:auth:browser
npm.cmd run build
```

Test trình duyệt dùng SDK thật và HTTP giả lập; chặn các request ra dịch vụ thật. Không tạo tài khoản hay dữ liệu test trên production. Kiểm tra schema production dùng truy vấn `limit 0`, không lấy bản ghi người dùng; kiểm tra RLS/privileges bằng metadata PostgreSQL. Không truy cập Firebase.

Frontend cần build/deploy bản mới trên từng website đang chạy. Việc chỉ cập nhật schema không thay thế bản JavaScript đã deploy. Script import Firebase hiện chỉ chuyển hồ sơ/bảng dữ liệu, không chuyển tài khoản Firebase Auth hay mật khẩu sang Supabase Auth.
