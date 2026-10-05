# SportSpace

Ứng dụng tìm và đặt sân thể thao, quản lý cơ sở và ghép đội. React 18/Vite, Firebase Auth/Firestore/Storage, Cloud Functions Node 22. Hỗ trợ tiếng Việt/Anh và giao diện sáng/tối. Sa bàn 3D đã được bỏ.

## Chạy ứng dụng

```powershell
npm.cmd ci
npm.cmd ci --prefix functions
npm.cmd run dev
```

Danh sách sân, bộ lọc thông tin và thống kê công khai đọc trực tiếp catalogue Supabase, không cần Edge Function. Khi bảng `Facilities` chưa có dữ liệu, frontend dùng catalogue đóng gói trong `src/data/venues.json` để website vẫn hiển thị sân; cần import dữ liệu vào Supabase để dùng dữ liệu production mới nhất. Cache trình duyệt giữ trang kết quả 5 phút, thống kê/tỉnh thành 15 phút để giảm lượt đọc khi tải lại. Lọc lịch trống, tài khoản và các thao tác ghi vẫn cần Edge Function `sportspace`. Backend Firebase production chưa được deploy trong đợt này; xem [hướng dẫn vận hành](docs/VAN_HANH_FIREBASE.md) trước khi mở các luồng giao dịch.

Edge Function `sportspace` cần secret `SUPABASE_DB_URL` trỏ tới Supabase pooler/database URL. Function chỉ mở một kết nối PostgreSQL với timeout ngắn để tránh worker bị giới hạn tài nguyên; sau khi thay đổi `supabase/functions/sportspace`, cần deploy lại function.

Để phát triển cục bộ, chạy Firebase Emulator với project `demo-sportspace`, đặt `$env:VITE_USE_EMULATORS='true'` trong terminal frontend rồi chạy Vite. Không dùng credentials production cho test. Khi bật cờ DEV, toàn bộ Firebase client dùng project demo.

## Các luồng đã triển khai

- Giữ sân bằng transaction và khóa mỗi ô 30 phút; hỗ trợ đặt 30/60/120 phút, giờ mở qua nửa đêm và giá server tính theo phụ thu.
- Chuyển khoản toàn bộ giá thuê, giữ chỗ tối đa 10 phút, QR đúng cấu hình đã xác minh, upload biên lai riêng. Chủ sân kiểm tra số tiền/mã giao dịch rồi xác nhận; biên lai chưa chứng minh đã nhận tiền.
- Hủy trước 12 giờ đủ điều kiện yêu cầu hoàn tiền đã xác minh. Chủ sân chuyển hoàn thực tế và lưu tham chiếu; trạng thái hủy/hoàn độc lập. Tiền đến muộn có luồng đối soát, không chiếm sân đã có người khác giữ. Chưa có ví hoặc cổng thanh toán tự động.
- Hồ sơ thật, yêu thích theo tài khoản, khôi phục mật khẩu, xác minh email, hồ sơ chủ sân chờ admin duyệt. Client không tự sửa role, điểm, owner hoặc tiền.
- Dashboard theo quyền sở hữu: sân/ảnh/giá/bảo trì, duyệt đơn, đối soát, review; tiền nhận ròng từ Ledger và tỷ lệ giờ sân từ đơn đã xác nhận.
- Ghép trận tạo/sửa/tham gia/rời/hủy; chống vượt chỗ và tính lặp UID, nhận diện host bằng UID. Thành viên nhận thông báo khi thay đổi kèo.
- Review từ đơn đã hoàn tất, phản hồi chủ sân được lưu, thông báo riêng theo UID và nhắc lịch trong app. Uy tín có sự kiện tham dự đã xác minh, không tự phạt vì đã qua giờ.
- Điểm Google hiển thị khi cơ sở có dữ liệu đã nhập; thiếu dữ liệu thì có liên kết tìm sân trên Google Maps theo tên/địa chỉ. Không dùng Places API trả phí và không tự đồng bộ điểm Google. Không lấy rating chưa xác minh từ file local để gán cho cơ sở thật.
- Xóa tài khoản với xác thực lại, kiểm tra giao dịch đang hoạt động và cleanup có thể thử lại; ẩn danh thông tin khách trong lịch sử tài chính cần giữ.
- Phân trang sân/đơn bằng cursor, debounce/cache tìm kiếm, kiểm tra lịch trống, realtime giới hạn và lazy-load dashboard.
- Lọc tìm kiếm sân và kèo ghép đội theo khoảng cách địa lý (Haversine distance) thông qua lấy vị trí người dùng.
- Lọc kèo ghép đội theo các ngày tương đối (Hôm nay, Ngày mai, 3 ngày tới, 1 tuần tới).

## Cấu trúc

| Đường dẫn | Nội dung |
| --- | --- |
| src/components | Giao diện người chơi, chủ sân và admin |
| src/services/api.js | Callable, realtime và upload có kiểm tra |
| src/services/publicVenues.js | Đọc danh sách công khai, phân trang 24 sân, tìm kiếm và thống kê không phụ thuộc callable |
| functions/domain.js | Quy tắc giờ/giá/hủy/ghép trận dùng chung |
| functions/service.js | Quyền và giao dịch phía server |
| functions/maintenance.js | Hết giữ chỗ, nhắc lịch, cleanup tài khoản/ảnh |
| firestore.rules, storage.rules, firestore.indexes.json | Quyền dữ liệu và indexes cần deploy |
| test, functions/test | Kiểm thử nghiệp vụ, Rules và trình duyệt trên emulator |
| src/utils/geo.js | Hàm tính khoảng cách Haversine và lấy vị trí người dùng |
| scripts/audit-data.mjs | Rà bản export cũ offline, chỉ dry-run |

## Kiểm tra

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:emulators
```

Emulator cần Java 21+ và Chrome cho browser test. Dữ liệu test nằm trong project demo riêng. Test trình duyệt kiểm tra đăng nhập, giữ sân, phục hồi sau refresh, gửi biên lai và chủ sân duyệt; có kiểm tra mobile và VI/EN, sáng/tối. Bộ test không gửi tiền ngân hàng thật.

Kiểm tra riêng danh sách công khai: `node scripts/check-public-directory.mjs`. Script chạy Chrome ẩn và Vite ở cổng 3002, chỉ đọc dữ liệu công khai của Firebase thật, không đăng nhập hay ghi dữ liệu. Kiểm tra danh sách khi Cloud Functions bị chặn, phân trang/bộ lọc, cache qua reload và mobile/EN/dark; có phát sinh lượt đọc Firestore.

[Kế hoạch và trạng thái khắc phục](docs/KE_HOACH_KHAC_PHUC.md) · [Schema, migration và triển khai Firebase](docs/VAN_HANH_FIREBASE.md).

Phần vận hành còn cần dữ liệu chủ sở hữu/giá/ngân hàng được xác minh, đối soát đơn cũ, backup, staging, cấu hình CORS/Auth/Scheduler và deploy đồng bộ. Tìm kiếm chuỗi hiện còn scan server, chưa có full-text index; lịch sử review/thông báo/kèo giới hạn phạm vi tải. Không coi kiểm thử emulator là nghiệm thu production.
