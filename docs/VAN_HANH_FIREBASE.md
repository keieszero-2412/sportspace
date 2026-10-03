# Vận hành SportSpace sau khắc phục

Ngày: 03/10/2026. Mã nguồn đã có backend mới; chưa deploy hoặc chuyển đổi dữ liệu Firebase thật.

Sửa lỗi danh sách trống: frontend đã đọc trực tiếp dữ liệu công khai, không cần callable cho danh sách/catalogue. Kiểm tra Chrome chỉ đọc ngày 03/10/2026 xác nhận 1.912 cơ sở, 7.377 sân con; đạt phân trang, bộ lọc, tìm kiếm không dấu, cache khi mất kết nối, mobile 320px và EN/dark. Backend giao dịch vẫn chưa triển khai; kiểm tra này không nghiệm thu đặt sân/thanh toán production.

## Quy trình đã chọn

Khách chuyển khoản toàn bộ giá thuê, chủ sân kiểm tra giao dịch và biên lai. Giữ sân tối đa 10 phút, có thể ngắn hơn nếu sát giờ chơi. Chỉ người sở hữu cơ sở được xác nhận đúng số tiền và mã giao dịch ngân hàng. Không có ví nội bộ, webhook cổng thanh toán hoặc chuyển tiền tự động.

Hủy trước ít nhất 12 giờ tạo yêu cầu hoàn khoản đã xác minh. Hủy muộn không tự tạo yêu cầu hoàn. Chủ sân chuyển lại về tài khoản đã thanh toán, kiểm tra số tiền và mã giao dịch hoàn rồi xác nhận trong app. Chuyển khoản đến sau khi hết giữ sân được đối soát riêng, tạo yêu cầu hoàn và không chiếm lại sân đã có người khác đặt. Khoản thiếu/thừa phải được xử lý ngoài app; backend từ chối xác nhận sai số tiền.

Ghép trận cho tham gia trực tiếp, không dùng hàng chờ duyệt. Host sửa/hủy kèo; thành viên được thông báo. Kèo hiện tại không gắn một booking bắt buộc. Điểm uy tín chỉ cộng tối đa 2 khi khách xác nhận tham dự và chủ sân hoàn tất đơn, giới hạn 100, mỗi booking một sự kiện. Chưa tự phạt bỏ hẹn hoặc xử lý khiếu nại điểm.

## Schema và trạng thái

| Collection | Dữ liệu / quyền |
| --- | --- |
| Facilities | Cơ sở công khai, `ownerId` đã duyệt, `operating_hours`, pricing và version |
| Courts | Sân thật, `facilityId` canonical, `facility_id` tương thích, basePrice VND/giờ, status active/maintenance/archived, imageUrl |
| Users | Chỉ tài khoản tương ứng đọc; role và credibilityScore do server quản lý |
| MerchantApplications | Hồ sơ riêng, pending/approved; người nộp và admin đọc |
| PaymentConfig | Tài khoản nhận tiền đã xác minh, chỉ backend đọc |
| Bookings | schemaVersion 2, UID khách/chủ sân, khoảng `[startAt,endAt)`, snapshot giá/tài khoản nhận tiền, trạng thái tách biệt |
| SlotLocks | Khóa riêng cho mỗi sân/ô 30 phút; transaction ở server |
| Availability | Bản lịch công khai cùng transaction với khóa; không có thông tin khách |
| PaymentReferences, Ledger, AuditEvents | Chống sử dụng lại mã ngân hàng; dòng tiền nhận/hoàn và dấu vết xử lý, client không ghi |
| Matches, Reviews | Nội dung công khai, mutation qua backend; review chỉ cho đơn đã hoàn tất |
| Notifications, CredibilityEvents | Riêng theo UID; thông báo đọc và lịch sử điểm thật |
| AccountDeletions | Công việc xóa có thể thử lại; giữ tombstone để chặn token cũ tạo lại hồ sơ |

Booking: `held → pending_approval → confirmed → completed`; các nhánh `cancelled`, `rejected`, `expired`. Payment: `unpaid → pending_verification → paid`. Refund: `none → requested → refunded`. Đơn cancelled có thể vẫn đang chờ hoàn; cancelled không chứng minh tiền đã được hoàn.

Tiền nguyên VND, timestamp milliseconds do server tạo; múi giờ Asia/Ho_Chi_Minh. Snapshot giá không thay đổi khi sửa bảng giá. Giá phụ thu cộng theo ô 30 phút và làm tròn từng ô. Báo cáo tiền nhận ròng là dòng tiền xác minh trong ngày/tuần, không phải doanh thu kế toán. Tỷ lệ giờ sân là giờ confirmed/completed chia cho giờ mở cửa của các sân active, theo ngày phục vụ; không tính như số lượt đặt chia số sân.

Xóa tài khoản yêu cầu xác thực lại, không cho merchant xóa khi còn sở hữu cơ sở hoặc khách còn đơn/yêu cầu hoàn/kèo host đang hoạt động. Xóa Auth/profile/giấy tờ/biên lai/thông báo; bỏ tên, điện thoại, ghi chú khỏi lịch sử giữ để đối soát. Lưu ID và chứng cứ tài chính, ẩn danh review/kèo. Tác vụ 5 phút tiếp tục cleanup thất bại. Cần chính sách thời hạn lưu dữ liệu cụ thể trước vận hành.

## Chạy và kiểm thử cục bộ

Node 22, Java 21+, Chrome. Cài `npm.cmd ci` ở root và `npm.cmd ci --prefix functions`. Không dùng service account production để chạy test.

```powershell
npm.cmd run build
npm.cmd test
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-emulator-tests.ps1
```

Script emulator dùng `demo-sportspace` và dữ liệu kiểm thử riêng, xóa dữ liệu của project demo trước mỗi lượt. Java có thể nằm trong `.tools/java` hoặc JAVA_HOME/PATH. Script tắt DEBUG và bỏ biến môi trường nhạy cảm khỏi process emulator. Functions Emulator cần thời gian khởi động trên Windows; browser kiểm tra callable trước khi mở trang. Screenshot nằm trong `test-results`, không phải dữ liệu vận hành.

Kết quả kiểm chứng đợt này: 6 unit test, 12 integration test và browser flow giữ sân/biên lai/duyệt/hủy/xác nhận hoàn đều đạt. Audit offline đã chạy trên bản export demo. Scheduler được kiểm tra qua hàm xử lý trực tiếp trong integration; Emulator không tự kích hoạt Cloud Scheduler. Google OAuth, email xác minh, giao dịch ngân hàng, CORS và lịch chạy production chưa được nghiệm thu.

Build tham chiếu: main bundle khoảng 932 kB, gzip 241 kB; dashboard merchant và admin có chunk riêng. Đây là số đo build cục bộ, không phải thời gian tải hoặc lượt đọc database production.

Chạy thủ công: `npx firebase emulators:start --project demo-sportspace`. Ở terminal frontend đặt `$env:VITE_USE_EMULATORS='true'`, rồi `npm.cmd run dev`. Cờ này chỉ dùng khi DEV; build production không kết nối emulator.

## Rà dữ liệu cũ trước triển khai

Tạo backup Firestore/Storage và ghi nhận Rules/indexes/Auth provider đang chạy. Export read-only các collection về file riêng trong `data_export`; định dạng mỗi collection là mảng `[{"id":"...","data":{...}}]`. Export có thông tin cá nhân phải được giữ riêng, không commit. Không đưa service account vào công cụ rà dữ liệu.

```powershell
node scripts/audit-data.mjs --input data_export/snapshot.json --output data_export/audit.json
```

Công cụ chỉ tạo báo cáo và đề xuất, không kết nối Firebase hoặc ghi database. Cần duyệt mapping alias sân, UID chủ sân, giá thực, giờ chuẩn, bản ghi trùng và bằng chứng ngân hàng. Không tự gán chủ sân từ tên, tự sinh sân con/giá, hoặc coi depositPaid cũ là đã nhận tiền. Đơn cũ đang hoạt động chặn đặt mới theo ngày/cơ sở; chuyển đổi khoảng giờ và tạo khóa phải theo báo cáo đã đối soát, trong cửa sổ bảo trì, transaction kiểm tra không có khóa mới. Bản ghi chưa đủ dữ liệu giữ nguyên và chưa nhận đặt mới.

Facilities công khai phải được tách giấy tờ/tài khoản ngân hàng riêng trước deploy Rules. Nội dung Reviews/Matches công khai cũng cần rà thông tin cá nhân trong dữ liệu cũ. Frontend có reader tương thích alias và nhãn trạng thái cũ; backend từ chối sửa tiền của đơn chưa chuyển đổi.

## Thứ tự đưa vào vận hành

1. Thử trên staging Firebase riêng, xác nhận billing/Cloud Functions, Storage và Scheduler. Thiết lập admin custom claim từ môi trường quản trị đáng tin cậy; checkbox frontend không cấp quyền. Xác nhận Email/Google Auth và authorized domains.
2. Backup, bật bảo trì luồng ghi cũ; duyệt và xử lý migration. Cần plan cụ thể trên bản sao dữ liệu thật trước khi ghi production; công cụ audit không thực hiện migration.
3. Deploy indexes và chờ ready; deploy backend, Firestore/Storage Rules đồng bộ trong cửa sổ bảo trì. Lệnh tham khảo: `npx firebase deploy --project <PROJECT_ID> --only functions,firestore,storage`. Không chạy khi chưa hoàn thành bước trước.
4. Admin duyệt cơ sở/chủ sân và xác minh BIN/số tài khoản/tên người nhận thực. Chủ sân lưu giá, trạng thái sân và giờ hoạt động. Cơ sở thiếu dữ liệu sẽ bị backend chặn đặt.
5. Kiểm tra Storage CORS cho origin frontend để tải biên lai bằng Blob có Auth; không dùng download token công khai cho giấy tờ. VietQR là dịch vụ tạo ảnh QR bên ngoài; nếu ảnh lỗi vẫn dùng thông tin chuyển khoản hiển thị. Kiểm tra tài khoản thật trước mở nhận tiền.
6. Danh sách/catalogue công khai đọc trực tiếp Firestore theo Rules hiện hành và hoạt động khi callable chưa triển khai. Lọc lịch trống, tài khoản và đặt sân vẫn cần backend/Rules/indexes mới: chỉ mở các luồng này sau khi deploy đồng bộ và thử trên staging.
7. Xác minh Scheduler chạy `expireHolds` mỗi 5 phút và `cleanCourtPhotos` lúc 03:00 +07. Nhắc lịch trong app trước 1 giờ, chống trùng. Không có email nhắc lịch. Cleanup ảnh chỉ tác động `court_photos` không được tham chiếu và đã quá 24 giờ.

Rollback: đưa UI vào bảo trì, giữ backend/Rules an toàn đang quản lý đơn schema 2, phục hồi phiên bản frontend tương thích đọc nếu cần. Không mở lại quyền ghi trực tiếp từ frontend cũ và không restore snapshot tiền đè giao dịch mới. Đối soát Ledger/PaymentReferences/AuditEvents trước sửa đơn; restore dữ liệu theo collection và phạm vi sự cố đã duyệt.

## Giới hạn và theo dõi

- Danh sách công khai đọc Firestore từng nhóm tối đa 60, phân trang 24; lọc tỉnh hoặc môn thể thao bằng single-field index rồi tìm chuỗi trong nhóm kết quả. Cache công khai lưu trong trình duyệt 5 phút, thống kê/tỉnh thành 15 phút, tách theo project; không chứa tài khoản ngân hàng, giấy tờ hay dữ liệu đặt sân. Tỉnh thành được lấy bằng cách nhảy qua từng giá trị trong index, tổng số dùng count aggregation. Lọc lịch trống vẫn qua server, không cache kết quả. Chưa có full-text index nên tìm chuỗi hiếm vẫn tốn lượt đọc; cần đo staging khi tăng quy mô. Cache hết hạn hoặc chưa có sẽ không thay thế Firestore nếu dịch vụ lỗi/quota cạn.
- Danh sách realtime có giới hạn: 100 đơn mới nhất, tải đơn cũ bằng cursor; 100 kèo tương lai và 100 review/thông báo đang tải. Rating hiển thị phạm vi đã tải. Chưa có phân trang mọi lịch sử review/thông báo/kèo.
- Scheduler mỗi lượt xử lý 200 hold/200 reminder và 20 công việc xóa. Theo dõi backlog khi mở rộng; nhắc lịch không có SLA email.
- Theo dõi lỗi callable, số expired/pending_approval sát hạn, refund requested chưa đối soát, AccountDeletions pending, lỗi Storage/CORS và thời gian truy vấn catalogue. Không log dữ liệu request, credential hoặc toàn bộ environment.
- Chưa kiểm chứng cổng Auth Google, ngân hàng, CORS, indexes và billing của Firebase production. Emulator không chứng minh các cấu hình đó đúng.

Tài liệu nền tảng: [Firebase callable](https://firebase.google.com/docs/functions/callable), [Firestore transactions](https://firebase.google.com/docs/firestore/manage-data/transactions), [Rules testing](https://firebase.google.com/docs/rules/unit-tests), [VietQR Quick Link](https://www.vietqr.io/danh-sach-api/link-tao-ma-nhanh/).
