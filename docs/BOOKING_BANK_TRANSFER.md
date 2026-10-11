# Chuyển khoản khi đặt sân

Client booking dùng Supabase Edge Function `sportspace`. Cần áp dụng migration
`20261009020000_booking_bank_transfer.sql` sau các migration booking hiện có và
deploy lại Edge Function cùng frontend. Việc sửa mã nguồn không cập nhật server.

Điều kiện nhận booking:

- `Facilities.ownerId` phải là UID Supabase của chủ sân đã được duyệt.
- Court phải thuộc đúng facility và đang hoạt động. Schema import được hỗ trợ qua
  `raw_data`, `facility_id`, `is_available` và giá ngày/tối/cuối tuần; trạng thái
  ngừng hoạt động rõ ràng luôn chặn booking.
- `PaymentConfig` của facility phải có BIN ngân hàng 6 chữ số, tài khoản, tên người
  nhận và `verifiedAt`. Chỉ admin xác minh thông tin nhận tiền thực tế.
- Edge Function cần `SUPABASE_DB_URL` và service-role key phía server.

Không tự gán chủ sân, dùng tài khoản ngân hàng mẫu hoặc bỏ kiểm tra xác minh để
vượt qua lỗi thiếu dữ liệu. Export catalogue không chứng minh sân đã sẵn sàng nhận
thanh toán. Lỗi `facility-owner-not-configured` phân biệt thiếu chủ sân với sân
ngừng hoạt động; lỗi `payment-not-configured` chỉ ra thiếu ngân hàng đã xác minh.

Giữ sân tối đa 10 phút → snapshot ngân hàng và số tiền server tính → QR → tải biên
lai vào bucket riêng tư `sportspace-receipts` → chờ chủ sân kiểm tra thực nhận.
Gửi biên lai không đồng nghĩa đã thanh toán. Chủ sân duyệt bằng đúng số tiền và
mã giao dịch chưa từng dùng; duyệt sau hạn giữ sân bị chặn. Tiền đến muộn được ghi
nhận để hoàn, không chiếm lịch của đơn thay thế. Hủy và xác minh hoàn tiền là hai
thao tác độc lập; số tiền thực nhận/hoàn được ghi Ledger trong cùng transaction.

Ảnh sân và tài liệu cũ vẫn dùng bucket `sportspace`. Biên lai mới lưu
`receiptBucket` để dashboard đọc đúng bucket; biên lai cũ không được di chuyển.
Các migration tạo policy riêng cho upload biên lai của người đặt và đọc của
người đặt/chủ sân. Cần kiểm thử trên staging để xác nhận policy và publication
Realtime thực tế. Tests mock không thay thế kiểm thử cạnh tranh trên PostgreSQL.

Kiểm tra cục bộ:

```powershell
node --test test/booking-transfer.test.mjs test/auth.test.mjs test/profile-data.test.mjs functions/test/*.test.js
npm.cmd run build
```

Phạm vi thay đổi này gồm giữ sân, QR, gửi biên lai, duyệt/từ chối/hủy, đối soát
tiền đến muộn và xác minh hoàn tiền. Các API dashboard khác như thống kê, hoàn tất
buổi chơi, sửa sân hoặc lịch sử phân trang cần được đánh giá riêng khi triển khai
toàn bộ dashboard Supabase.

## Chọn nhiều sân

Client gửi `selections: [{ courtId, times }]` cùng facility, ngày và thời lượng.
Tối đa 16 ô cho cả đơn. Trên mỗi sân, chặn khoảng trống bằng đúng một ô theo
thời lượng đã chọn; các ô liền nhau hoặc cách từ hai ô trống trở lên đều hợp lệ.
Client cho chỉnh lựa chọn tạm thời chưa hợp lệ, nhưng chặn tiếp tục; server kiểm
tra lại bằng cùng quy tắc, kể cả khung giờ qua nửa đêm.

Edge Function khóa các court theo thứ tự ID, kiểm tra toàn bộ lựa chọn trước khi
ghi và giữ tất cả trong một transaction. Các dòng chi tiết được lưu trong cột
JSON hiện có `raw_data.bookingItems`; không cần migration riêng. Các trường
`courtName`, `time`, `ranges`, `lockIds`, `totalAmount` vẫn phục vụ lịch sử và
dashboard. Gửi biên lai, duyệt và hủy xử lý toàn đơn. Payload một sân cũ vẫn được
chấp nhận. Cần deploy Edge Function cùng frontend; backend Firebase cũ không
phục vụ payload nhiều sân của luồng Supabase này.
