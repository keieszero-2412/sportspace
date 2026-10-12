# Lịch bận mô phỏng từ matchmaking

Người dùng cho phép bỏ UI/UX-only và tự động tạo lịch mô phỏng trong phiên 12/10/2026.

- Chỉ dùng 400 kèo `mockData=true`, `seedVersion=2` đã gắn sân hợp lệ.
- `SimulationMatchTemplates` lưu mẫu cố định; `SimulatedBookings` lưu booking mô phỏng, tách hoàn toàn khỏi `Bookings`, thanh toán, cọc và đối soát.
- `Availability` có đúng ID sân, ngày, giờ, `expiresAt=endAt`, `mockData=true`, `simulationManaged=true`, `matchId`. Giao diện và backend giữ chỗ hiện hữu đều nhận biết ô bận này.
- Job `sportspace-simulated-match-schedule` chạy phút 05 mỗi giờ trên Supabase pg_cron. Lặp lịch mẫu theo chu kỳ 20 ngày và duy trì cửa sổ bảy ngày phía trước; các kèo mẫu ban đầu còn hiệu lực được nối lịch ngay.
- Không ghi đè lịch thật; khóa sân giống luồng giữ chỗ và bỏ qua xung đột. Không tạo tài khoản, không thay ID người tham gia. Kèo mới giữ tên mẫu đã sửa, title là bộ môn.
- Trigger đồng bộ khi sửa lịch hoặc hủy kèo mô phỏng; không can thiệp thay đổi thành viên. Hết giờ, ô bận hết hiệu lực ngay theo `expiresAt`; cron cập nhật trạng thái lịch sử, không xóa dữ liệu.
- Feed loại kèo đã bắt đầu theo quy tắc sẵn có và cập nhật đồng hồ cục bộ mỗi 30 giây, không phát sinh truy vấn polling. Book Venue không tính lịch đã kết thúc là ô bận.

Triển khai: `node scripts/admin/deploy-simulated-match-schedule.mjs --apply`.

Kiểm tra sinh lịch tương lai, không trùng, hủy và toàn vẹn liên kết (mọi ghi thử rollback): `node scripts/admin/test-simulated-match-schedule.mjs`.

Dừng tạo mới: quản trị database gọi `select cron.unschedule('sportspace-simulated-match-schedule');`. Các ô đang có vẫn tự hết hiệu lực, không hủy đơn thật.

Frontend cần triển khai riêng để áp dụng cập nhật đồng hồ cục bộ. Database/cron không phụ thuộc frontend hay máy của người dùng.

## Bổ sung coverage toàn bộ sân đủ dữ liệu

- Migration `20261012010000_simulated_venue_coverage.sql` thêm cron phút 15 mỗi giờ, lịch bảy ngày. Ngày thường một lượt/sân/ngày, cuối tuần hai lượt; ưu tiên 17:00–21:00 và tuân thủ giờ mở cửa, lưới 30 phút. Lịch đang có được giữ nguyên.
- `SimulatedBookings.matchId` cho phép null cho lịch coverage không có kèo; không bịa danh sách người tham gia. Các caller kiểm tra liên kết phải phân biệt lịch coverage với lịch có matchId.
- Tạo 16.902 lượt mới ở 1.878 sân đủ giờ mở cửa. Cộng lịch matchmaking hiện hữu: hôm nay 1.880 sân có lịch bận.
- 34 sân thiếu/sai giờ mở cửa nên chưa được coverage; không tự bịa giờ để kích hoạt booking thật. Không cập nhật được từ raw_data vì dữ liệu này cũng thiếu.
- Ô đang được đặt vẫn đỏ khi trận bắt đầu và chỉ mất trạng thái bận sau endAt; các ô quá khứ trống vẫn xám.
- Audit anonymous `scripts/audit/check-public-booking-timetable.mjs` dùng đúng bộ lọc court_id/date, đồng thời kiểm tra giờ mở cửa tạo được ô giao với lịch bận. Không đọc Bookings/private profiles.
- Không phát sinh thanh toán, đơn Bookings thật hay ghi đè lịch thật. Booking cũ, giá, thành viên được giữ nguyên.
