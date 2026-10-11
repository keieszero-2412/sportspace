# Duyệt nguồn ảnh, giá và điện thoại trong admin

## Đã triển khai mã nguồn

Workspace admin dùng header riêng trong App; không render Hero, quảng bá ghép
đội hay footer người chơi. Các lượt tải catalogue/sân công khai/preview matches,
sân yêu thích và notifications được dừng trong workspace, phục hồi khi trở lại
trang người chơi. Không thay Hero hoặc MatchmakingSection của trang người chơi.

Lỗi tải hồ sơ chủ sân được xác định là thiếu bảng MerchantApplications. Đã áp
dụng migration `20261011030000_admin_merchant_applications.sql` trên Supabase,
giữ đúng payload applyMerchant/approveMerchant đang chạy, không tạo hồ sơ thật.
RLS cho chủ hồ sơ/admin đọc; anon và user khác bị chặn, client không ghi trực
tiếp. Đã kiểm thử fixture rollback và xác minh không lưu dữ liệu test. Admin
hiển thị nguồn lỗi, giữ mã Supabase và có Thử lại, không che lỗi bằng fallback.

Giao diện có thanh điều hướng Dữ liệu sân / Nguồn ảnh cũ / Hồ sơ chủ sân /
Tài khoản nhận tiền. Thống kê dạng thẻ, bảng nguồn có cuộn ngang trên mobile;
danh sách thiếu nguồn và ảnh cũ thu gọn. Bộ ảnh dạng lưới có vùng cuộn riêng,
đánh dấu ảnh đang chọn, so sánh ảnh hiện tại với ảnh thay thế và form xác nhận
tách biệt. CSS chỉ nằm trong phạm vi admin, dùng token sáng/tối hiện có.
`node scripts/check-admin-layout.mjs` kiểm tra desktop 1440px và mobile 390px
bằng service mock, chặn mọi kết nối ngoài; ảnh screenshot là fixture, không
phải ảnh thật của sân. Không dùng Firebase hoặc dữ liệu production để test UI.

- `AdminPanel` có phần “Duyệt nguồn ảnh, điện thoại và giá sân” riêng. Danh sách
  ảnh cũ mở cửa sổ chọn ảnh cho đúng sân thay vì nút Đạt/Không đạt lưu localStorage
  hoặc cuộn lên đầu trang. Cửa sổ chỉ hiển thị phần ảnh, không bảng độ phủ/tìm sân.
  Ghi chú duyệt cũ vẫn được giữ để xem, không tự chuyển thành phê duyệt.
- Chọn một ảnh cụ thể có trạng thái Đã chọn và xem trước ảnh thay thế. Nút
  Lưu ảnh đã chọn gửi đúng URL/candidateId cùng giá trị hiện tại tới Supabase;
  chưa chọn hoặc chưa xác nhận đúng sân/quyền sử dụng thì không cho lưu.
- Phần mới đọc danh sách và giá trị hiện tại từ Supabase, tìm tên sân và phân trang
  24 sân/lần, không bị giới hạn bởi danh sách 200 sân của form ngân hàng cũ.
- Có ảnh hiện tại, ảnh ứng viên, nguồn, bằng chứng tên/địa chỉ, thời điểm kiểm tra,
  chọn từng ứng viên, nhập nguồn thủ công, duyệt/từ chối và lịch sử 50 lần gần nhất.
- Nguồn chưa tìm được được ghi rõ; không tự sinh số điện thoại, giá hoặc ảnh.
- API `reviewVenueData` xác minh quyền admin phía server. RPC ghi dữ liệu và lịch
  sử trong cùng transaction, khóa hàng, kiểm tra giá trị hiện tại và key chống lặp.
  Nếu sân vừa đổi trường đang duyệt, admin phải tải lại và xem xét lại.
- Phê duyệt chỉ thay một trường Facilities cùng metadata nguồn trong `raw_data`;
  phone metadata được cập nhật vào cột tương ứng để tương thích `getVenuePhone`.
  Từ chối chỉ thêm lịch sử, không thay dữ liệu sân.
- Ảnh phải xác nhận đúng sân và quyền sử dụng/giấy phép. Điện thoại không nhận
  số lặp đáng nghi `0598370497` khi phê duyệt mới. Không tự xóa dữ liệu cũ.
- Giá giữ nguyên đơn vị nguồn: sân/giờ, nửa sân/giờ, sân/trận, gói, buổi, theo người
  hoặc chưa rõ thời lượng. Chỉ giá một sân/60 phút mới gắn `/h`. Không sửa Courts,
  PricingRules, booking đã tạo hoặc bảng giá checkout.
- Cache API danh bạ bị xóa sau thao tác review thành công để lần đọc tiếp theo
  lấy giá trị mới. Không thay đổi các API booking, chủ sân hoặc xác minh ngân hàng.

## Nguồn đã tổng hợp để chọn

| Loại | Sân có ứng viên | Ứng viên |
| --- | ---: | ---: |
| Ảnh | 935 | 5243 |
| Điện thoại | 53 | 61 |
| Giá tham khảo | 222 | 328 |

Ứng viên ảnh lấy từ manifest và bộ nguồn tên/địa chỉ đã nghiên cứu; không có mặc
nhiên cấp phép bản quyền. Điện thoại đối chiếu tên/địa chỉ từ contacts cục bộ và
loại hotline website/số lặp đáng nghi, không lấy số từ footer. Giá chỉ dùng hàng
`curated_public_price` và các ứng viên hàng đợi được đối chiếu lại tên/địa chỉ,
với nguồn, đơn vị và bằng chứng. Ứng viên hàng đợi không phải giá đã xác minh.

## Thống kê ngày 11/10/2026

Đối chiếu 1.912 sân theo snapshot Supabase, không dùng Firebase. Trường đang có:
1.912 ảnh, 1.912 điện thoại, 1.893 mô tả giá (không đồng nghĩa đã chính xác).
1.798 sân vẫn có số nghi vấn 0598370497; 1.844 ảnh Wikimedia chung.

Bộ nguồn sau rà cache có 935 sân với 5.243 ứng viên ảnh, 53 sân với 61 ứng viên
điện thoại và 222 sân với 328 ứng viên giá. Có 39 sân đủ cả ba loại nguồn,
919 sân có một phần, 954 sân chưa có nguồn nào. Còn thiếu nguồn ảnh ở 977 sân,
điện thoại ở 1.859 sân, giá ở 1.690 sân. Không suy đoán để lấp phần thiếu.

Admin có bảng độ phủ, bộ lọc và danh sách thiếu từng loại; báo cáo đầy đủ tại
`data_export/venue-review-coverage.json`. Số đã duyệt/từ chối tính quyết định mới
nhất của từng sân/trường, phân trang toàn bộ lịch sử; lỗi không được đổi thành 0.
Snapshot kiểm tra cho thấy bảng VenueDataReviews chưa triển khai, vì vậy chưa
thể xác nhận số đã duyệt hay nghiệm thu lưu trên production.

Research dùng contacts và HTML cache, metadata công khai và hàng đợi giá.
Không nhập giá template nền tảng; không vượt đăng nhập/challenge. Link diadiem
phát hiện thêm đều đã có cache nên không tải lặp. Dùng `--resume` để tiếp tục
nguồn ứng viên đã lưu; `--network` chỉ đọc trang công khai, `--snapshot` chỉ đọc
Facilities/lịch sử Supabase. Không thao tác Firebase hoặc ghi dữ liệu vận hành.

Đã mở lại nguồn công khai ngày 11/10/2026 cho các mẫu mới: điện thoại
[Giảng Võ Club / HTL](https://sanpick.com/san-pickleball-ha-noi/) và giá
[Master Bros](https://shopvnb.com/san-pickleball-master-bros.html),
[My Dink 5](https://shopvnb.com/san-pickleball-my-dink-5.html).
Các quan sát được lưu trong `docs/data/venue-review-observations.json`; không
khẳng định toàn bộ nguồn cũ còn đúng hiện nay. Chưa có nguồn cho mọi sân.

Tổng hợp offline bằng `node scripts/build-venue-review-sources.mjs`, không kết nối
Firebase/database. JSON sinh ra chỉ được tải cùng phần admin mới.

## Triển khai và giới hạn

1. Áp dụng migration `20261011010000_venue_data_reviews.sql` sau migration bổ sung
   các cột công khai Facilities hiện có.
2. Deploy Edge Function `sportspace` kèm `venueData.js`.
3. Build/deploy frontend. Admin tự duyệt từng lựa chọn; không import ứng viên vào
   dữ liệu vận hành trước khi duyệt.

## Backend production đã triển khai ngày 11/10/2026

- Đã áp dụng riêng migrations `20261011010000`, `20261011020000` và ghi migration tracking trên
  project `dzpbnvpqkwsjlvdxwwub`; bảng VenueDataReviews hiện có 0 bản ghi.
- Đã deploy `sportspace` version 17, ACTIVE. Payload lấy từ bản production v16
  trong `scratch/venue-review-deploy`, chỉ thêm module và route reviewVenueData;
  không đưa thay đổi booking/matchmaking chưa triển khai từ worktree lên cùng.
  Giữ nguyên verify_jwt=false; worker vẫn kiểm tra Supabase Auth phía ứng dụng.
- RLS bật; anon không đọc bảng, authenticated chỉ có SELECT qua policy admin,
  không INSERT trực tiếp hay EXECUTE RPC. Chỉ service_role gọi được RPC.
- Worker OPTIONS trả 200; yêu cầu không đăng nhập bị chặn bằng lỗi auth.
- Không thao tác Firebase, không áp dụng ứng viên hay thay dữ liệu Facilities.

Theo phê duyệt rõ ràng của người dùng, đã cấp `Users.role=admin` cho đúng profile
Supabase Auth của `keieszero2412@gmail.com`. Metadata legacy dạng JSON string
được giữ nguyên, không tự chuẩn hóa hồ sơ hoặc thay dữ liệu tài khoản khác.
Policy lịch sử dùng helper security-definer `venue_review_is_admin()` chỉ kiểm
tra role của caller; không đổi policy Users vốn không cho authenticated đọc.

Kiểm thử PostgreSQL với profile admin đã đạt: approve cùng giá trị, idempotency,
CAS conflict, key conflict, chặn non-admin, reject không đổi dữ liệu sân, admin
đọc lịch sử và non-admin không đọc được. Toàn bộ fixture trong transaction đã
rollback; kiểm tra lại Facilities giữ nguyên và không lưu bản ghi test.

**Giới hạn nghiệm thu:** chưa đăng nhập trình duyệt bằng tài khoản người dùng
hoặc nghiệm thu thao tác lưu qua giao diện. Frontend đã build local, chưa deploy
trong lượt triển khai backend này. Không cần đổi Auth metadata để cấp quyền vì
Edge Function và RLS đều lấy role từ profile Users theo Auth UID.

Các test offline cho validation, RPC caller, SSR và hồi quy luồng dùng chung đã
đạt. Quyền catalog production, worker auth guard và transaction/RLS đã xác minh.
