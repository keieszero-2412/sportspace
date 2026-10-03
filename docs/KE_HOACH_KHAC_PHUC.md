# Kế hoạch hoàn thiện SportSpace

Ngày lập/cập nhật: 03/10/2026. Trạng thái: đã triển khai mã nguồn và kiểm thử cục bộ; chưa triển khai Firebase production. [x] ghi nhận phần mã nguồn đã có, không thay thế nghiệm thu staging/production.

Mục tiêu: hoàn thiện tất cả vấn đề đã xác định trong đợt rà soát, theo thứ tự phụ thuộc; bảo đảm giao diện phản ánh đúng dữ liệu đã lưu và kết quả nghiệp vụ thực tế. Sa bàn 3D đã được bỏ khỏi phạm vi sản phẩm.


## Tiến độ triển khai hiện tại

Đã chọn chuyển khoản và chủ sân kiểm tra biên lai theo trả lời của người dùng. Backend là Firebase Cloud Functions Node 22, giữ sân tối đa 10 phút, thanh toán toàn bộ giá thuê, yêu cầu hoàn tiền khi hủy trước ít nhất 12 giờ; không có ví nội bộ. Ghép trận hiện tham gia trực tiếp.

| Giai đoạn | Kết quả mã nguồn | Phần còn phụ thuộc / giới hạn |
| --- | --- | --- |
| 0 | Schema 2, trạng thái, quyết định thanh toán, emulator, công cụ audit offline dry-run | Chưa đọc cấu hình production hoặc chạy báo cáo trên backup thật; cần duyệt dữ liệu cũ |
| 1 | Bỏ thành công giả, mock review/Hero/sân sinh tự động; lỗi tiền/chi phí được kiểm tra; Toast, retry, ErrorBoundary | Cần thử dữ liệu thật trên staging |
| 2 | Auth/profile thống nhất, yêu thích theo UID, đơn xin merchant/admin, Rules, xóa có reauth và cleanup thử lại | Google/email/Auth provider thật chưa kiểm chứng; yêu thích local cũ không tự nhập |
| 3 | CRUD sân/ảnh/giá/giờ/bảo trì lưu thật; version và snapshot giá; cleanup ảnh mồ côi | Scheduler và Storage/CORS cần cấu hình khi deploy |
| 4 | Múi giờ +07, khoảng giao nhau, khóa transaction, expiry, idempotency, realtime, phục hồi giữ sân sau refresh | Đơn legacy cần đối soát trước mở nhận lịch |
| 5 | QR theo tài khoản đã xác minh, copy/tải ảnh, biên lai riêng, chủ sân kiểm tra tiền/mã giao dịch | Ngân hàng thật chưa cấu hình; không có gateway; tiền thiếu/thừa đối soát ngoài app |
| 6 | Duyệt/từ chối/hủy/hoàn/hoàn tất, audit và Ledger, chống mã giao dịch trùng, tiền đến muộn | Chủ sân thực hiện chuyển tiền ngoài app; cần quy trình vận hành và thời hạn xử lý |
| 7 | Tạo/sửa/join/leave/cancel, cap nguyên tử, host UID, danh sách thành viên và thông báo đổi kèo | Không có hàng chờ host duyệt hoặc booking liên kết bắt buộc |
| 8 | Review theo đơn hoàn tất, phản hồi, thông báo đọc thật, reminder có chống trùng, lịch sử uy tín | Rating chỉ phạm vi review tải; chưa có email nhắc lịch, xử lý khiếu nại điểm hoặc tự phạt no-show |
| 9 | Cursor sân/đơn, debounce/cache, bỏ response cũ, truy vấn đúng owner, lịch trống, cash ledger, KPI giờ sân, lazy dashboard | Search chuỗi còn scan server; lịch sử kèo/review/notification chưa phân trang đầy đủ; chưa đo lượt đọc production |
| 10 | Unit và integration emulator, browser dùng Auth/callable/Storage thật của emulator, build frontend | Staging, migration trên backup thật, triển khai, theo dõi và rollback thực tế chưa nghiệm thu |

Không ghi dữ liệu, cấp quyền, chuyển tiền hoặc deploy vào Firebase production trong đợt này. Không có credential production nào được dùng để chạy test. Xem [schema và hướng dẫn vận hành](VAN_HANH_FIREBASE.md), bao gồm backup, dữ liệu cũ, thứ tự deploy, CORS/Scheduler và giới hạn.

Các checkbox giữ mở vì có đầu việc chưa đủ điều kiện hoặc chưa được nghiệm thu; không coi toàn bộ kế hoạch đã hoàn tất. Gateway/wallet và duyệt join không nằm trong phương án MVP hiện chọn.

**Kiểm chứng cục bộ:** build production đạt; 6 unit test và 12 integration test trên emulator đạt. Chrome đã chạy đăng nhập, giữ sân, refresh phục hồi, upload biên lai, chủ sân duyệt, khách hủy và chủ sân xác nhận hoàn, đổi tài khoản, 320 px và EN/sáng/tối; không có lỗi React. Công cụ audit dry-run chạy trên bản export emulator, không ghi database. Chưa chạy ngân hàng thật, migration hoặc deploy production.

## 1. Phạm vi và nguyên tắc thực hiện

- Giữ React/Vite và Firebase làm nền tảng hiện tại. Đề xuất bổ sung lớp xử lý phía server bằng Cloud Functions/Admin SDK cho quyền sở hữu, giữ chỗ, thanh toán, hoàn tiền và điểm uy tín. Chốt phương án ở giai đoạn 0 trước khi viết các luồng phụ thuộc.
- Kết luận rà soát dựa trên mã nguồn và kiểm tra logic độc lập. Chưa xác minh Firebase Security Rules/Storage Rules, indexes hoặc cấu hình thanh toán thực tế đang triển khai.
- Tuân thủ `.agents/rules/project_rules.md`: thay đổi có phạm vi, Toast/ConfirmModal thay popup trình duyệt, hỗ trợ VI/EN và sáng/tối, tránh giật layout và mất dữ liệu thật.
- Không chạy seed/randomize hoặc sửa dữ liệu production để kiểm thử. Dữ liệu kiểm thử phải nằm trong môi trường kiểm thử riêng, không được trình bày như dữ liệu vận hành.
- Bổ sung kiểm thử cho các quy tắc có rủi ro: quyền truy cập, cạnh tranh giữ chỗ, khoảng giờ, tiền, xử lý lặp và đồng bộ dữ liệu. Không mở rộng kiểm thử hình thức cho mọi thay đổi văn bản.
- Mỗi giai đoạn có đầu ra review được, kiểm tra phù hợp và `npm.cmd run build` khi thay đổi mã ứng dụng. Thay đổi Rules, backend và migration phải có kiểm tra riêng; build frontend không xác nhận các phần này đúng.

## 2. Thứ tự triển khai

| Giai đoạn | Mục tiêu | Phụ thuộc | Điều kiện hoàn tất chính |
| --- | --- | --- | --- |
| 0 | Chốt quy trình, dữ liệu và môi trường kiểm thử | Không | Có schema, trạng thái, chính sách tiền và kế hoạch xử lý dữ liệu cũ |
| 1 | Sửa lỗi hiển thị và thông báo gây hiểu nhầm | 0 | Không báo thanh toán/hoàn tiền/xóa dữ liệu thành công khi chưa thực hiện |
| 2 | Hoàn thiện Auth, hồ sơ và quyền sở hữu | 0–1 | Một nguồn hồ sơ; khách và chủ sân không đọc/ghi vượt quyền |
| 3 | Lưu và đồng bộ cơ sở, sân con, ảnh, giá | 2 | Thay đổi còn tồn tại sau tải lại; giá được dùng thống nhất |
| 4 | Hoàn thiện lịch, múi giờ và chống đặt trùng | 2–3 | Một khoảng giờ không thể được giữ/đặt cho hai người |
| 5 | Thanh toán và xác nhận đơn thực tế | 4 | Đơn chỉ xác nhận sau bằng chứng thanh toán được kiểm tra |
| 6 | Hủy, hoàn tiền và xử lý đơn của chủ sân | 5 | Trạng thái và tiền đối soát được; thao tác lặp không hoàn hai lần |
| 7 | Hoàn thiện ghép trận | 2; 4 nếu liên kết với booking | Tạo/tham gia/rời/duyệt/xóa kèo đúng quyền và số chỗ |
| 8 | Đánh giá, thông báo và uy tín | 6–7 | Có dữ liệu thực, điều kiện nghiệp vụ và lịch sử xử lý |
| 9 | Tìm kiếm, realtime, thống kê và hiệu suất | 3–8 | Không tải toàn bộ dữ liệu cho mỗi màn hình; số liệu đúng phạm vi |
| 10 | Kiểm thử xuyên suốt và đưa vào vận hành | 0–9 | Các tiêu chí cuối tài liệu đạt; có phương án quay lui |

Thực hiện lần lượt theo bảng. Có thể sửa lỗi cục bộ sớm, nhưng không nghiệm thu một luồng chỉ dựa vào Toast hoặc state giao diện khi backend chưa hoàn tất.

## 3. Công việc và tiêu chí nghiệm thu từng giai đoạn

### Giai đoạn 0 — Chốt quy trình và mô hình dữ liệu

**Công việc**

- [ ] Kiểm tra read-only Rules, indexes, cấu hình Auth/Storage và môi trường hiện có; không đưa nội dung service account hoặc `.env` vào tài liệu/log.
- [x] Chốt định nghĩa cụm sân, sân con và quyền sở hữu: `Facilities.ownerId`, `Courts.facilityId`, `Bookings.ownerId` được lấy từ cơ sở đã xác minh. Không tin `ownerId`, giá hoặc role do client tự gửi.
- [x] Chốt schema chung: ID ổn định, số tiền nguyên theo VND, timestamp server, múi giờ cơ sở, `startAt/endAt`, tổng tiền, cọc phải trả, tiền đã nhận và tham chiếu giao dịch. Tách giờ bắt đầu/kết thúc khỏi chuỗi chỉ phục vụ hiển thị.
- [x] Chốt máy trạng thái đặt sân, thanh toán và hoàn tiền độc lập. Đề xuất booking: `held → pending_payment → pending_approval/confirmed → completed`, cùng `expired`, `rejected`, `cancelled`; payment: `unpaid`, `pending_verification`, `paid`, `failed`; refund: `none`, `requested`, `processing`, `refunded`, `failed`. Xác định rõ chuyển trạng thái nào làm giữ hoặc giải phóng sân.
- [x] Chốt cọc là toàn bộ hay một phần giá thuê, ai duyệt đơn, thời gian giữ chỗ, điều kiện hủy trước 12 giờ, cách xử lý hủy muộn, và hoàn về phương thức gốc hay ví nội bộ. Ví chỉ nằm trong phạm vi khi có quyết định triển khai thật.
- [x] Chọn thanh toán chuyển khoản có duyệt biên lai cho MVP hoặc tích hợp cổng thanh toán. Việc tích hợp phụ thuộc tài khoản merchant, thông tin người nhận và môi trường thử nghiệm được cung cấp.
- [ ] Lập bảng ánh xạ dữ liệu cũ: `facility_id/facilityId`, `venueId`, `confirmed/approved/pending`, `cost/costPerPerson`, thời gian dạng chuỗi. Lập báo cáo bản ghi thiếu owner, giờ, số tiền hoặc mâu thuẫn; không tự đoán và ghi đè.
- [ ] Chuẩn bị schema version, migration có chế độ dry-run, backup/restore và khả năng chạy lại an toàn. Đơn cũ có `depositPaid` không mặc nhiên chứng minh đã nhận tiền.
- [x] Thiết lập môi trường kiểm thử riêng và các kiểm tra Auth/Rules, giao dịch giữ chỗ, thanh toán và hoàn tiền.

**Nghiệm thu:** có tài liệu quyết định nghiệp vụ và schema; mỗi trạng thái có hành động hợp lệ, người được phép thực hiện và ảnh hưởng đến sân/tiền. Quyết định chưa có không bị thay bằng giả định thanh toán thành công.

### Giai đoạn 1 — Sửa lỗi tức thời và thông báo sai

**Phạm vi:** `BookingModal`, `MatchmakingSection`, `UserProfileModal`, `VenueDetailModal`, `AuthModal`, `App`.

- [x] Bỏ thông báo khẳng định đã trả/hoàn tiền khi chỉ cập nhật trạng thái. Trong thời gian backend chưa hoàn thiện, khóa thao tác hoặc thông báo rõ chức năng chưa sẵn sàng.
- [x] Chuẩn hóa `costPerPerson`, thêm ngày và chi phí vào form kèo, kiểm tra giá trị thiếu trước render; hỗ trợ đọc dữ liệu cũ mà không làm sập VI/EN.
- [x] Sửa dependency `savedVenues`, tách danh sách yêu thích theo tài khoản, tránh gán sân yêu thích mặc định không do người dùng chọn. Đồng bộ đa thiết bị sẽ hoàn thành ở giai đoạn 2.
- [x] Thay `alert/confirm` bằng Toast đúng loại và ConfirmModal. Bổ sung loading/error/empty/retry cho tìm sân, kèo, hồ sơ và quản lý; giữ dữ liệu đang có khi cập nhật ngầm.
- [x] Bọc modal và sub-view cần thiết bằng ErrorBoundary cục bộ; không để lỗi dữ liệu ở một kèo làm sập toàn bộ app.
- [x] Bỏ đánh giá mẫu và kèo Hero viết sẵn khỏi màn hình vận hành; ảnh thiếu có nhãn ảnh minh họa. Chưa có số sân thực thì hiển thị trạng thái chưa có dữ liệu.
- [x] Không sinh sân con dự phòng rồi cho phép đặt như sân thật; không gắn nhãn “Sẵn sàng” khi chưa kiểm tra lịch và trạng thái sân.

**Nghiệm thu:** lỗi chi phí kèo không làm crash; mọi thông báo khớp hành động thực; dữ liệu tải chậm/lỗi không bị diễn giải thành “không có sân”; không có dữ liệu mẫu được trình bày như dữ liệu thật.

### Giai đoạn 2 — Tài khoản, hồ sơ và phân quyền

**Phạm vi:** `App`, `AuthModal`, `UserProfileModal`, Firebase Rules và lớp xử lý hồ sơ phía server.

- [x] Tạo một luồng hoàn tất đăng ký/hydrate hồ sơ; xử lý thứ tự giữa tạo Auth user, lưu profile và listener. Bổ sung `authLoading/profileLoading` và xử lý lỗi.
- [x] Lưu tên, SĐT, trình độ, môn yêu thích và ngôn ngữ; khởi tạo form từ hồ sơ thật. Email liên hệ và email đăng nhập có ý nghĩa rõ ràng; đổi email Auth cần quy trình xác minh phù hợp.
- [x] Hoàn thiện Google redirect, khôi phục ý định đăng ký và dọn cờ session sau xử lý; đăng nhập không ghi đè hồ sơ hoặc role đã có.
- [x] Hoàn thiện khôi phục mật khẩu, xác minh email và hướng dẫn lỗi đăng nhập. SĐT chỉ là thông tin liên hệ cho đến khi luồng xác minh số được triển khai.
- [x] Lưu hồ sơ đăng ký chủ sân, thông tin cơ sở và các file cần thiết trong vùng riêng có kiểm soát. Trạng thái đề nghị/đã duyệt tách khỏi quyền vận hành; không tự cấp role từ checkbox hoặc nút đổi state.
- [x] Gắn chủ sân đã duyệt với cơ sở của họ; query dashboard chỉ lấy dữ liệu thuộc quyền sở hữu. Rules/backend từ chối thao tác khác chủ sở hữu ngay cả khi gọi trực tiếp ngoài UI.
- [x] Ngăn client sửa quyền, điểm uy tín, trạng thái thanh toán, số dư, owner và giá đã xác nhận. Cấp quyền quản trị bằng cơ chế phía server được chốt ở giai đoạn 0.
- [ ] Đồng bộ sân yêu thích theo UID và thiết bị; chuyển danh sách cũ trên trình duyệt theo lựa chọn người dùng, không gán chung giữa hai tài khoản.
- [x] Triển khai xóa tài khoản thực qua xử lý có xác thực lại, kiểm tra đơn còn hoạt động, xử lý tài liệu/file liên quan và chính sách lưu lịch sử giao dịch. Không hứa xóa lịch sử cần giữ nếu quy trình không thực hiện điều đó.

**Nghiệm thu:** đăng ký rồi tải lại vẫn giữ đúng thông tin; người dùng thường không tự cấp quyền; hai chủ sân không truy cập dữ liệu của nhau; đăng xuất không bị thông báo là xóa tài khoản; yêu cầu xóa có kết quả xác nhận được.

### Giai đoạn 3 — Cơ sở, sân con, ảnh và giá

**Phạm vi:** `MerchantDashboard`, `VenueDetailModal`, `BookingModal`, Storage Rules và services dữ liệu sân.

- [x] Đọc, thêm, sửa, ngừng hoạt động/bảo trì sân từ Firestore theo chủ sở hữu; ID sinh ổn định, không dựa vào số lượng phần tử trong state.
- [x] Không xóa mất lịch sử hoặc làm hỏng đơn tương lai khi đóng/xóa sân; kiểm tra booking đang hoạt động và có quy trình xử lý.
- [x] Lưu ảnh tải lên vào sân/cơ sở; kiểm tra MIME, kích thước, quyền đường dẫn, tiến trình và lỗi. Xử lý ảnh đã upload nhưng tạo sân thất bại, thay ảnh và file không còn tham chiếu.
- [x] Lưu giá cơ bản theo sân, khung giờ cao điểm, phụ thu cuối tuần và hiệu lực; dùng cùng nguồn giá cho dashboard, bảng giá và checkout.
- [x] Giá có version và được tính lại ở server khi tạo giữ chỗ/đơn. Lưu snapshot giá vào đơn, không đổi tiền của đơn cũ khi chủ sân cập nhật giá.
- [x] Lưu lịch đóng cửa và bảo trì theo ngày/khoảng giờ; đưa vào kiểm tra availability ở giai đoạn 4.

**Nghiệm thu:** thêm/sửa/bảo trì còn tồn tại sau tải lại; ảnh mở được bằng quyền phù hợp; giá khách thấy khớp giá đã xác nhận; thay đổi giá không sửa đơn cũ.

### Giai đoạn 4 — Lịch sân, thời gian và giữ chỗ

**Phạm vi:** `BookingModal`, lịch chủ sân và lớp xử lý availability/booking phía server.

- [x] Dùng ngày địa phương theo múi giờ cơ sở; xử lý đúng đầu ngày, cuối ngày, qua nửa đêm và thứ cuối tuần. Không lấy ngày địa phương bằng `toISOString().split('T')[0]`.
- [x] Kiểm tra giao nhau bằng khoảng `[startAt, endAt)`; chặn mọi phần của đơn 30/60/120 phút chồng lên đơn hoặc lịch bảo trì. Cho phép hai đơn liền kề khi giờ kết thúc bằng giờ bắt đầu.
- [x] Kiểm tra giờ mở/đóng cửa, thời lượng tối thiểu, giờ đã qua và tính hợp lệ của các ô chọn. Giờ kết thúc không vượt giờ đóng cửa; ô qua nửa đêm thuộc đúng ngày.
- [x] Chọn một mô hình khóa có thể giao dịch nguyên tử, ví dụ document khóa theo sân và ô cơ sở 30 phút. Chuẩn hóa giờ bắt đầu theo ô đó; đọc và ghi toàn bộ khóa liên quan trong transaction phía server. Không chỉ query “có đơn trùng không” rồi `addDoc`.
- [x] Giữ chỗ có owner, thời hạn server và idempotency key. Xử lý hai người cùng đặt, bấm lặp, mất mạng, đóng tab, hết hạn và retry. Việc dọn khóa trễ không được làm khóa đã hết hạn chặn sân mãi.
- [x] Đổi ngày/sân hủy lựa chọn không còn hợp lệ, không để response ngày cũ ghi đè lịch ngày mới. Lỗi đọc lịch không mặc định cho phép đặt.
- [x] Đồng bộ lịch đang mở với khóa và đơn thực tế; unsubscribe khi đóng màn hình. Đếm ngược phản ánh thời hạn server và không gia hạn bằng refresh.

**Nghiệm thu:** kiểm tra cạnh tranh chỉ một người giữ được cùng khoảng giờ; 09:30–10:30 chặn 10:00; kiểm tra 30/60/120 phút, bảo trì, liền kề, mở qua nửa đêm và 00:30 tại +07 đều đúng.

### Giai đoạn 5 — Thanh toán và xác nhận đơn

**Phạm vi:** checkout/payment của `BookingModal`, dịch vụ payment, Storage và backend xác minh.

- [x] Tạo mã đơn/tham chiếu ổn định ở server; giá, người nhận và nội dung thanh toán lấy từ cấu hình đã xác minh, không hardcode tài khoản trong JSX.
- [x] Tạo QR thanh toán thật hoặc hướng dẫn chuyển khoản đúng số tiền/tham chiếu; triển khai copy thực tế và tải QR qua Blob. Hiển thị lỗi khi thao tác thất bại.
- [x] Nếu dùng biên lai: chọn/upload file thật, lưu metadata riêng tư, chuyển `pending_verification`; người có quyền duyệt phải kiểm tra giao dịch. Ảnh biên lai không tự chứng minh đã trả tiền.
- [ ] Nếu dùng cổng thanh toán: tạo giao dịch phía server, xác thực callback/webhook, kiểm tra amount/currency/order và chống phát lại. Không tin trang redirect từ client như kết quả thanh toán cuối cùng.
- [x] Chỉ chuyển `paid/confirmed` theo luồng đã chốt; ghi audit event và dữ liệu đối soát. Hết thời hạn thì không cho xác nhận bằng UI hoặc gọi API trực tiếp.
- [ ] Xử lý callback lặp, thanh toán thiếu/thừa, lỗi mạng, webhook đến muộn sau hết hạn giữ sân và hoàn/đối soát khi sân đã được đặt cho người khác. Không ghi đè một booking khác.
- [x] Khóa nút khi gửi, dùng idempotency phía server để bấm lại không tạo nhiều đơn. Trạng thái cuối được đọc từ server và tồn tại sau tải lại.

**Nghiệm thu:** chưa trả tiền không thể được ghi là đã trả; mọi QR/copy/upload hoạt động thật; callback giả hoặc lặp không tạo xác nhận mới; xử lý rõ giao dịch muộn.

### Giai đoạn 6 — Duyệt đơn, hủy và hoàn tiền

**Phạm vi:** `MerchantDashboard`, `UserProfileModal`, backend chuyển trạng thái/refund.

- [x] Duyệt/từ chối ghi vào database qua xử lý có quyền, điều kiện trạng thái và audit log. Cùng một bộ chuyển trạng thái cho màn hình khách và chủ sân.
- [ ] Tính điều kiện hủy từ thời gian server và giờ bắt đầu, gồm mốc 12 giờ và qua nửa đêm; hiển thị trước số tiền được hoàn và phí nếu có.
- [x] Hủy tạo yêu cầu hoàn riêng, lưu tiền đã trả/thực hoàn và mã giao dịch; không gộp `cancelled` với `refunded`. Giải phóng sân theo quy trình đã chốt.
- [x] Triển khai hoàn tiền qua phương thức được chọn. Nếu có ví: sổ giao dịch và cập nhật số dư nguyên tử, khóa quyền client. Nếu chưa có ví: bỏ lời hứa “hoàn về ví”.
- [ ] Xử lý provider thất bại, retry và đối soát; một yêu cầu chỉ có một kết quả hoàn hợp lệ. Tổng hoàn không vượt số tiền thực nhận.
- [x] Bổ sung luồng hoàn tất trận/đơn; hủy muộn hoặc đơn đã hoàn tất không được xử lý như đơn đang chờ.

**Nghiệm thu:** khách và chủ sân thấy cùng trạng thái sau tải lại; mốc 12 giờ đúng; retry không hoàn hai lần; thông báo chỉ nói đã hoàn khi có kết quả xác minh.

### Giai đoạn 7 — Ghép trận

**Phạm vi:** `MatchmakingSection`, danh sách kèo trong hồ sơ/Hero và dịch vụ membership.

- [x] Form có ngày, giờ bắt đầu/kết thúc, số người, trình độ và chi phí; validate và lưu schema thống nhất. Tách tên hiển thị khỏi ID cơ sở/booking nếu kèo liên kết với sân đã đặt.
- [x] Dùng `hostId` xác định quyền sửa/xóa/duyệt, không dùng tên. Lưu trạng thái kèo và thời hạn; kèo đã qua không nhận người mới.
- [x] Tham gia qua transaction/membership duy nhất theo UID, giữ số chỗ nguyên tử; một UID không bị tính nhiều lần. Chặn bấm lặp cả UI lẫn server.
- [ ] Hoàn thiện rời kèo, hủy kèo, duyệt/từ chối yêu cầu và xử lý host rời/hủy. Chốt cách giữ chỗ cho yêu cầu đang chờ để không vượt sức chứa.
- [x] Host xem danh sách thành viên với thông tin phù hợp quyền; thành viên được thông báo khi kèo đổi lịch/hủy.
- [x] Đồng bộ số người và kèo thật trên Hero; chỉ hiển thị kèo còn nhận người. Lịch sử trong hồ sơ đọc cùng nguồn dữ liệu.

**Nghiệm thu:** hai người tranh chỗ cuối chỉ một người được chấp nhận; join lặp không tăng đếm; người trùng tên không xóa kèo của nhau; VI/EN, rời và hủy kèo hoạt động đúng.

### Giai đoạn 8 — Đánh giá, thông báo và uy tín

**Phạm vi:** `VenueDetailModal`, `NotificationModal`, `UserProfileModal`, tab reviews chủ sân, backend events.

- [x] Lưu review vào Firestore, chỉ cho người đủ điều kiện từ đơn đã hoàn tất; giới hạn trùng theo booking/người viết, hỗ trợ sửa trong phạm vi cho phép.
- [ ] Tính rating/count từ review thật; tách đánh giá SportSpace và số liệu Google được nhập trước đó, không gắn review nội bộ dưới nhãn Google Maps.
- [x] Chủ sân đọc và trả lời review được lưu, khách thấy trả lời sau tải lại; xử lý nội dung lỗi/quá dài và quyền sửa/xóa.
- [ ] Tạo notification từ event đã thành công: đặt/duyệt/từ chối/hủy/hoàn tiền, tham gia/đổi/hủy kèo. Lưu theo UID, trạng thái đã đọc và hạn lưu; cập nhật badge realtime.
- [x] Nhắc lịch bằng tác vụ phía server; nếu gửi email, cấu hình kênh và retry/chống gửi trùng. Không tuyên bố đã gửi nếu chỉ tạo Toast.
- [ ] Tính điểm uy tín từ sự kiện có bằng chứng: hoàn tất, xác nhận tham dự, bỏ hẹn hoặc đánh giá theo quy tắc đã chốt. Có lịch sử điểm, giới hạn và cơ chế xử lý báo cáo sai; không suy ra bỏ hẹn chỉ vì đã qua giờ.
- [x] Chống áp dụng event hai lần và ngăn client sửa điểm. Điểm 0 phải hiển thị là 0, không dùng `score || 100`.

**Nghiệm thu:** review/response/đã đọc tồn tại trên thiết bị khác; notification và điểm bắt nguồn từ sự kiện thực; retry không gửi/trừ điểm hai lần; người chưa chơi không tự đánh giá như khách đã dùng sân.

### Giai đoạn 9 — Dữ liệu, tìm kiếm và hiệu suất

**Phạm vi:** `App`, Hero, services truy vấn và dashboard thống kê.

- [x] Tách query/service dùng chung để giảm logic đọc/ghi rải trong component; tránh refactor các khu vực không liên quan.
- [ ] Phân trang bằng cursor với thứ tự ổn định; lọc quyền sở hữu, tỉnh, môn và trạng thái tại nguồn khi khả thi. Thay “Xem thêm” cắt mảng bằng tải trang thật.
- [x] Bảo toàn tìm kiếm theo tên/địa chỉ đã có: xác định giới hạn tìm kiếm Firestore, chuẩn hóa từ khóa và chọn index/dịch vụ tìm kiếm nếu cần. Không lọc chỉ trang đầu rồi báo không có kết quả toàn bộ.
- [x] Bổ sung tìm theo ngày/giờ trống bằng nguồn availability giai đoạn 4, không suy ra trống chỉ từ cơ sở tồn tại.
- [x] Cache theo query, UID và quyền; invalidation sau mutation, debounce từ khóa, loại bỏ response cũ. Xóa cache riêng tư khi đổi tài khoản.
- [x] Realtime chỉ cho booking/kèo/notification đang theo dõi; giới hạn truy vấn và hủy listener. Không subscribe toàn database.
- [x] Thống kê theo chủ sân và khoảng ngày đúng múi giờ: doanh thu hôm nay/tuần, tỷ lệ lấp đầy, rating thật; phân biệt tiền cọc nhận, hoàn tiền và doanh thu được ghi nhận theo chính sách.
- [x] Tổng sân/sân con lấy từ nguồn tổng hợp thực, không từ số phần tử trang đang tải hoặc hằng số 7380.
- [ ] Rà chunk/import Firebase, lazy-load dashboard/modal nặng theo số đo. Ghi baseline build, tải trang và số lần đọc; đặt ngưỡng nghiệm thu từ dữ liệu kiểm thử thay vì tuyên bố nhanh hơn không có đo lường.
- [ ] Kiểm tra VI/EN và sáng/tối xuyên suốt; chuyển chuỗi hardcode cần thiết vào i18n, giữ đúng theme trong modal mở lâu. Kiểm tra 320/768/1024/1440px, zoom 50–200%, tab/keyboard và một vùng cuộn chính.

**Nghiệm thu:** tìm kiếm đúng vượt trang đầu, không fetch toàn bộ collection không cần thiết; số liệu đúng ngày/tuần/chủ sân; không còn listener sau đóng màn hình; có kết quả đo trước/sau.

### Giai đoạn 10 — Kiểm thử và vận hành

- [x] Kiểm tra unit cho interval/múi giờ/giá/chính sách hủy và máy trạng thái; Rules/backend integration cho quyền, tiền, xử lý lặp và cạnh tranh.
- [ ] Kiểm tra xuyên suốt hai người chơi và hai chủ sân: đăng ký → tìm sân → giữ chỗ → thanh toán → duyệt → hoàn tất; nhánh hết hạn, từ chối, hủy và hoàn thất bại.
- [ ] Kiểm tra tạo/tham gia/rời/hủy kèo → thông báo → review/uy tín; không có dữ liệu mẫu lọt vào màn hình thật.
- [ ] Kiểm tra mất mạng, tải lại giữa thanh toán, gửi hai lần, callback muộn/lặp, thiếu quyền và dữ liệu cũ thiếu trường.
- [ ] Chạy dry-run migration trên bản sao; đối soát số bản ghi, ID, booking đang hoạt động và tiền. Chỉ triển khai migration sau khi báo cáo review được và việc ghi dữ liệu thật nằm trong phạm vi đã được cho phép.
- [ ] Chuẩn bị thứ tự triển khai Rules/backend/frontend tương thích dữ liệu cũ, feature flags, backup, log không chứa bí mật và rollback. Không mở chức năng ghi tiền trước backend/Rules tương ứng.
- [ ] Theo dõi lỗi booking, giữ chỗ hết hạn, payment/refund chưa đối soát và query chậm; có cách xử lý sự cố cụ thể.
- [ ] Build frontend đạt; kiểm tra backend/Rules, các luồng xuyên suốt và giao diện đạt; cập nhật README và hướng dẫn vận hành.

**Nghiệm thu:** không còn hạng mục ưu tiên cao chưa xử lý; mọi thao tác tiền/quyền/trạng thái có kiểm tra phía server và dấu vết đối soát; không còn thông báo thành công giả; có đường quay lui khi triển khai.

## 4. Đối chiếu toàn bộ phát hiện với kế hoạch

| # | Phát hiện trong đợt rà soát | Giai đoạn xử lý |
| --- | --- | --- |
| 1 | Xác nhận đơn khi chưa kiểm tra thanh toán | 1, 5 |
| 2 | Bỏ sót khoảng giờ chồng nhau và đặt đồng thời | 4 |
| 3 | Hủy báo hoàn cọc nhưng không có giao dịch tiền/kiểm tra 12 giờ | 1, 6 |
| 4 | Tự đổi quyền chủ sân, đọc toàn bộ đơn | 2 |
| 5 | Xóa tài khoản chỉ đăng xuất | 1, 2 |
| 6 | `cost/costPerPerson`, thiếu ngày/chi phí, crash tiếng Anh | 1, 7 |
| 7 | QR/copy/tải QR/upload biên lai/đếm ngược chưa hoạt động thật | 4, 5 |
| 8 | Duyệt/từ chối/hoàn tiền của chủ sân chỉ đổi state | 6 |
| 9 | Sân con không tải/lưu đúng; ảnh chưa gắn vào sân | 3 |
| 10 | Ma trận lịch và cấu hình giá động chưa nối đặt sân | 3, 4 |
| 11 | `confirmed/pending/approved/cancelled/pending_refund` không thống nhất | 0, 4–6 |
| 12 | Hồ sơ đăng ký/chủ sân thiếu lưu trữ, race với Auth listener | 2 |
| 13 | Review mẫu, review chỉ lưu state, chủ sân không đọc được | 1, 8 |
| 14 | Thông báo rỗng và điểm uy tín chưa có xử lý | 8 |
| 15 | Ngày UTC sai ngày địa phương; sân mở qua nửa đêm | 4 |
| 16 | Ghép trận vượt chỗ/tính lặp, nhận diện host bằng tên, thiếu rời/duyệt | 7 |
| 17 | Tải toàn collection, phân trang giao diện, dữ liệu không realtime | 4, 7–9 |
| 18 | Memo yêu thích thiếu dependency, dùng chung giữa tài khoản/thiết bị | 1, 2 |
| 19 | Doanh thu tuần không lọc tuần; KPI cố định | 9 |
| 20 | Hero kèo mẫu, tổng sân cố định, nhãn trống sai, sân con tự sinh | 1, 3, 4, 7, 9 |
| 21 | Toast sai loại, popup native, thiếu loading/error/retry | 1, 9 |

## 5. Điều kiện và các quyết định còn cần chốt

Các mục này là đầu vào của kế hoạch, không phải yêu cầu xác nhận để tạo tài liệu:

1. Quyền truy cập read-only cấu hình Firebase hiện có để xác minh Rules/indexes và phân biệt cấu hình thiếu với mã nguồn chưa có.
2. Phương án backend, môi trường thử nghiệm và khả năng chạy tác vụ lịch/webhook.
3. Đã chọn chuyển khoản có duyệt biên lai. Còn cần BIN/tài khoản/tên người nhận thực tế được admin xác minh.
4. Đã triển khai thanh toán toàn bộ, chủ sân duyệt, giữ tối đa 10 phút, hủy trước 12 giờ đủ điều kiện yêu cầu hoàn về tài khoản thanh toán. Chưa có ví; cần nghiệm thu quy trình chuyển khoản thực tế.
5. Quy trình duyệt chủ sân, dữ liệu giấy tờ cần giữ và cách gán cơ sở cũ chưa có owner.
6. Cách xử lý booking cũ không có giờ chuẩn hoặc chưa có bằng chứng tiền; chính sách lưu lịch sử khi xóa tài khoản.
7. Ghép trận tham gia trực tiếp hay chủ kèo duyệt, và có bắt buộc liên kết booking hay không.

Không chạy migration, cấp quyền hoặc giao dịch tiền dựa trên giá trị đoán. Các quyết định thiếu chỉ chặn phần phụ thuộc; việc sửa lỗi cục bộ và xây dựng kiểm thử vẫn có thể tiếp tục.
