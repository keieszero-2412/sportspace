# Duyệt ảnh sân theo rating

## Mở rộng theo yêu cầu ngưỡng 50 ngày 11/10/2026

- `--relaxed` là chế độ tường minh: điểm tương đồng tên/địa chỉ tối thiểu 0,5, KHÔNG phải xác suất đúng đã đo. Ảnh chỉ có đối chiếu yếu được lưu `imageKind=candidate`, `imageIdentityConfidence=user_accepted_50_similarity` và nhãn công khai “Ảnh nguồn chưa xác minh”; không giả thành ảnh đã xác minh chắc chắn.
- Giữ nguyên 341 ảnh đã kiểm tra của lượt trước; xét toàn bộ ứng viên thay vì chỉ ba lựa chọn. Chỉ các quyết định từ chối do bộ lọc strict tự động trước đây được xét lại dưới quyền mới; từ chối thủ công vẫn được giữ.
- Đã kiểm tra 421 trang nguồn đã biết, thêm nguồn công khai (tổng 428 trang); các lượt đối chiếu bổ sung 371 ứng viên. Tìm theo tên 1.571 sân thiếu ảnh: 200 sân/21 ứng viên, rồi 1.371 sân/107 ứng viên. Không nói đã tìm hết Internet hoặc coi timeout là nguồn không tồn tại.
- Duyệt thêm 291 sân ở lượt `2e378adc-9502-4d2e-a67c-c940a9bf1442`, rồi 10 sân ở lượt `602f7777-72ce-45ef-b1e4-d0eea6c8ff71`; tổng 642 sân có ảnh nguồn đã kiểm tra. Đọc lại từng lượt xác nhận khớp ảnh hiện tại, không trùng URL hoặc SHA256 trong lượt.
- Chín ảnh minh họa thật Pexels đã được xem trực quan, không có địa chỉ/dấu hiệu nhận diện vị trí, gồm hai cầu lông, một bóng đá, một tennis, một bóng bàn, một bóng chuyền, một bóng rổ, hai pickleball. Giấy phép nguồn: https://www.pexels.com/license/ . Bỏ ảnh nguồn có nhãn ping-pong/pickleball mâu thuẫn bị bộ xét quyền chặn; dùng ảnh khác có nhãn nhất quán, không lách bằng đổi URL. Bỏ ảnh bóng rổ có nhà phía sau.
- Cấp random không hoàn lại sau lượt tìm ảnh sân: `d84e92ec-d51e-4f2c-807b-3ee7640e2b79`, chín sân, không xung đột; còn 1.261 sân chưa có ảnh đạt điều kiện. Chưa hoàn tất phủ ảnh 100%; ảnh generic cũ của các sân thiếu vẫn còn.
- Pool, nguồn, SHA256, cache kiểm tra và receipt đều lưu Supabase. Không xuất dataset local. Preview chỉ tải vào thư mục tạm hệ điều hành phục vụ xem ảnh.
- `research-venue-images-live.mjs --save` đối chiếu trang công khai; `search-missing-venue-images.mjs --save` tìm theo tên, có budget và cache. `resolve-sport-illustrations.mjs --apply` chỉ cấp ảnh đã được người vận hành xác nhận xem trực quan; `--verify` kiểm tra cả hash/URL ảnh nguồn và minh họa hiện tại.
- Không sửa dashboard admin, điện thoại, giá, booking hay Firebase. 132 test offline và build qua; chưa deploy frontend cho nhãn ảnh mới.

## Kết quả đọc lại Supabase ngày 11/10/2026

- Lượt `e9f68573-9319-436e-9f4b-017d8ba12b3a` đã xử lý đủ 1.912 sân, duyệt ảnh cho 341 sân trong khoảng 239 giây. Bỏ qua 33 lượt ứng viên trùng và 129 lượt ảnh không tải được/không hợp lệ; không diễn giải lỗi tải thành nguồn không tồn tại.
- Đọc lại xác nhận 341 bản duyệt khớp ảnh hiện tại, không có xung đột; số URL và SHA256 trùng trong các ảnh của lượt này đều bằng 0.
- 1.571 sân không nhận được ảnh từ lượt này, gồm thiếu nguồn đủ điều kiện, nguồn bị từ chối, ảnh lỗi hoặc trùng. Đây không phải số sân chắc chắn không có ảnh thật trên Internet.
- Kiểm kê ảnh hiện tại của toàn bộ danh sách vẫn có 1.534 sân thuộc 7 nhóm URL trùng; chưa khắc phục hoàn toàn thư viện ảnh cũ bằng ảnh minh họa.
- 130 test offline và build qua. Chưa deploy frontend, không truy cập Firebase.

Người dùng xác nhận có quyền sử dụng ảnh nguồn ngày 11/10/2026. Không gán giấy phép Creative Commons hoặc quyền sở hữu giả; lịch sử ghi đúng xác nhận của chủ dự án.

`node scripts/resolve-venue-images.mjs` đọc kế hoạch Supabase. `--apply` kiểm tra ảnh công khai và duyệt qua RPC hiện có. `--verify` đối chiếu ảnh hiện tại, lịch sử, URL chuẩn hóa và SHA256 của lượt duyệt.

- Ưu tiên rating sân cao, rồi ID ổn định. Rating lấy cột native trước, JSON nhập khẩu sau. Không tự tạo rating.
- Chỉ chọn nguồn đã khớp tên/địa chỉ; nguồn chỉ khớp tiêu đề tìm kiếm, nguồn bị từ chối, URL mock/logo/placeholder không đủ điều kiện.
- Kiểm tra HTTP, MIME, chữ ký JPEG/PNG/WebP và giới hạn 5 MB/7 giây. Dùng cache trong bộ nhớ, không xuất dữ liệu local hoặc đọc Firebase.
- Tránh trùng theo URL chuẩn hóa và SHA256. Đây KHÔNG phải kiểm tra perceptual hash hoặc bảo đảm ảnh crop/nén lại hoàn toàn khác nhau; chưa kiểm duyệt trực quan toàn bộ thư viện.
- Giữ quyền ưu tiên các ảnh đã được admin duyệt trước; lưu nguồn, SHA256 và mã lượt duyệt trong metadata. RPC so sánh giá trị hiện tại, không sửa điện thoại, giá, booking hoặc quyền admin.
- Test phát hiện bộ lọc ban đầu nhầm chuỗi `name_address_query` với nguồn đối chiếu địa chỉ. Đã dừng tiến trình, thu hồi 41 quyết định yếu của lượt `a2b61732-5b4c-45b3-9a04-ebaf3878acb6` và khôi phục ảnh trước đó chỉ khi ảnh vẫn thuộc lượt này. Lịch sử được giữ lại với lý do thu hồi; 24 quyết định đủ điều kiện được giữ.

## Ảnh minh họa

`allocateSportIllustrations` chọn ngẫu nhiên bằng crypto, không hoàn lại và khớp chính xác bộ môn. Không coi đổi URL/resize/crop là ảnh mới. Chỉ chấp nhận ảnh thật đã kiểm tra trực quan, không có dấu hiệu vị trí, có quyền sử dụng và SHA256. Nếu kho không đủ, trả rõ danh sách thiếu, không sinh mock, không lấy ảnh sân khác rồi chứng nhận là ảnh thật của sân này.

Giao diện thẻ sân và chi tiết hỗ trợ nhãn “Ảnh minh họa” qua `raw_data.imageKind=illustrative`; truy vấn công khai chỉ lấy marker này, không lộ metadata riêng tư. Phần frontend này chưa deploy. Chưa cấp ảnh minh họa hàng loạt: cần kho ảnh thật đủ số lượng, đã kiểm tra bộ môn và dấu hiệu vị trí.
