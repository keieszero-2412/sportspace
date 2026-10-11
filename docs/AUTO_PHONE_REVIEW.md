# Tự đối chiếu và duyệt điện thoại sân

## Duyệt toàn bộ theo yêu cầu ngày 11/10/2026

- Lượt tìm bổ sung có giới hạn tận dụng 1.465 URL đã kiểm tra, tải thêm 4 trang trong 9 giây và thêm 2 ứng viên có nguồn. Một request lỗi được ghi nhận, không coi là bằng chứng nguồn không tồn tại.
- Đã duyệt 1.373 ứng viên hợp lệ cho 448 sân; giữ số đã duyệt làm số chính nếu còn trong nguồn, nếu không dùng lựa chọn xếp hạng cao nhất. Loại 8 ứng viên không hợp lệ, không thêm số mock/random.
- Đã ẩn điện thoại của 1.464 sân không có nguồn sử dụng được sau lượt bổ sung. `phone_status=hidden_no_source`; số gốc vẫn giữ trong Supabase để phục hồi, không xóa dữ liệu.
- Lịch sử ghi rõ đây là duyệt hàng loạt theo yêu cầu, gồm ứng viên độ tin cậy thấp, không phải xác minh sở hữu bằng cuộc gọi. Ngưỡng tương đồng 50 không phải bảo đảm chính xác 50%.
- Lượt duyệt: `9dc00d41-e756-4547-a49d-5703d5c2398b`, lưu trong `VenueReviewCatalog.payload.phoneBulkResolution`. Ghi theo lô qua RPC hiện có, kiểm tra xung đột và bảo toàn mọi trường ngoài điện thoại. Không thay ảnh, giá, booking, quyền tài khoản hoặc Firebase.
- `node scripts/resolve-venue-phones.mjs` chỉ đọc kế hoạch; `--apply` thực hiện duyệt/ẩn; `--verify` đối chiếu trạng thái và lịch sử trên Supabase.
- Giao diện `VenuePhone` không hiển thị cả hàng hotline cho trạng thái ẩn; mã frontend cần được triển khai để bỏ luôn nhãn chưa xác minh trên website đang chạy. Trạng thái Supabase đã ngăn hiển thị số trên luồng công khai hiện có.
- 125 test offline và build đều qua; không chạy test Firebase.

`node scripts/auto-review-venue-phones.mjs --research` chỉ đọc và đối chiếu.
`node scripts/auto-review-venue-phones.mjs --apply` áp dụng các kết quả đủ điều kiện.

- Dùng danh sách sân hiện tại và nguồn từ Supabase; không phục hồi export local, không dùng Firebase hoặc fixture test.
- Tải URL công khai một lần mỗi lượt; tối đa 100 URL và 180 giây tìm nguồn. Giới hạn mỗi request 7 giây và 3 MB.
- Ưu tiên trang danh bạ có nhiều sân. Không truy cập widget yêu cầu đăng nhập, không vượt CAPTCHA, không tiếp tục host trả 401/403/429.
- Điện thoại phải có trong mục cụ thể của sân hoặc metadata doanh nghiệp, khớp tên, tỉnh/thành và địa chỉ. Địa chỉ có số phải khớp toàn bộ số. Loại hotline nền tảng, prefix không phù hợp và số cách ly đã biết.
- Chỉ chọn bản ghi khớp duy nhất một sân; bỏ qua số mâu thuẫn, dùng chung nhiều sân, số từng bị từ chối và số hiện tại đã được admin duyệt.
- Lưu bằng RPC `review_venue_data`, có kiểm tra giá trị hiện tại, quyền admin và lịch sử nguồn. Không sửa ảnh, giá, dữ liệu booking hoặc quyền người dùng.
- Bằng chứng và thời điểm đối chiếu nằm trong `VenueDataReviews`; số được áp dụng có `phone_sources` và `phone_checked_at`. Không lưu dataset hoặc HTML trên local.

Đây là xác minh theo nội dung công khai, không phải xác nhận bằng cuộc gọi rằng sân vẫn đang sử dụng số đó. Sân không đủ bằng chứng vẫn cần đối chiếu thủ công. Chế độ này là script chạy theo yêu cầu, không phải lịch chạy nền tự động.

## Kết quả lượt ngày 11/10/2026

- Đối chiếu danh sách 1.912 sân Supabase; lượt áp dụng tải 100 URL và trích được 456 bản ghi liên hệ trong khoảng 50 giây, gồm thời gian duyệt.
- Áp dụng 32 điện thoại; giữ nguyên 9 điện thoại đã duyệt. Những sân còn lại chưa có kết quả khớp chặt trong lượt có giới hạn này, không đồng nghĩa đã tìm hết nguồn trên Internet.
- Đọc lại xác nhận cả 32 bản duyệt khớp điện thoại, trạng thái và URL nguồn hiện tại trên Supabase.
- 117 test offline đều qua; không chạy test Firebase.

## Mở rộng tìm nguồn toàn bộ sân, ngưỡng tương đồng 50%

`node scripts/research-all-venue-phones.mjs --save` duyệt tất cả URL nguồn hiện có của toàn bộ danh sách sân, bổ sung một lượt liên kết danh bạ công khai phù hợp. Không còn giới hạn 100 URL. Hai worker, giới hạn request 9 giây/3 MB, không trình duyệt hoặc bộ dữ liệu local. Checkpoint lưu vào Supabase mỗi 100 trang để tránh mất kết quả.

Điểm 0,5 là heuristic tương đồng tên và địa chỉ, **không phải xác suất đúng 50%**. Vẫn loại số cách ly/hotline nền tảng, tỉnh/thành mâu thuẫn, tên chung chung và trường hợp chỉ khớp tỉnh. Kết quả yếu được lưu trong `VenueReviewCatalog.payload.venues[id].phone` với trạng thái `candidate_not_approved` và nguồn thật; không ghi đè điện thoại native hoặc giả mạo lịch sử duyệt. Ảnh, giá và các luồng dùng `Facilities` không thay đổi. Admin hiện có vẫn lọc tối đa ba lựa chọn.

`node scripts/research-all-venue-phones.mjs --status` đọc tổng nguồn điện thoại và tiến độ trong `payload.phoneResearch`. Danh sách trạng thái từng sân nằm trong Supabase, không tạo export local.

Mặc định tận dụng trạng thái URL đã kiểm tra trong 24 giờ từ Supabase để không tải lại. `--refresh` mới kiểm tra lại toàn bộ nguồn. Không giải thích ngưỡng 50% như một bảo đảm chính xác hay dùng số sân khác/hotline nền tảng để lấp đủ 100%.

## Kết quả mở rộng ngày 11/10/2026

- Đã đi qua 1.894 URL nguồn ban đầu của danh sách 1.912 sân và mở rộng đến 2.198 URL công khai. Chỉ mục 831 liên hệ công khai trong archive Supabase được đọc trong bộ nhớ, không phục hồi local.
- Lượt bổ sung từ Belo và PickleballPlus tận dụng 2.079 URL đã kiểm tra, xử lý 355 URL trong khoảng 150 giây. Có 7 request timeout được ghi nhận, không giả định chúng là nguồn không tồn tại.
- Đọc lại Supabase xác nhận **453 sân có 1.379 ứng viên điện thoại**, **1.459 sân chưa có ứng viên**, **41 sân có số hiện tại đã được duyệt**. Đây không phải kết quả 100% sân có số đúng.
- Ảnh giữ 935 sân/5.243 ứng viên; giá giữ 222 sân/328 ứng viên. Không cập nhật điện thoại native, ảnh, giá hoặc lịch sử duyệt trong lượt tìm ngưỡng 50%.
- 120 test offline đều qua. Không chạy Firebase hoặc kiểm tra bằng cuộc gọi thực tế.

`node scripts/report-venue-phone-coverage.mjs` đọc thống kê mới nhất. `--sample` bổ sung một sân chưa có nguồn mỗi tỉnh để tìm có mục tiêu. Muốn lấp đủ số thật cho các sân không công khai thông tin cần nguồn từ chủ sân/đơn vị quản lý; không thể bảo đảm bằng cách hạ điểm tương đồng.
