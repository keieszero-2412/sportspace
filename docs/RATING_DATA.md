# Rating của cơ sở

## Chính sách tra cứu hiện tại (10/10/2026)

Theo yêu cầu mới của người dùng: ưu tiên thời gian và tài nguyên, lưu rating xác minh
được; bỏ qua sân không tìm thấy, chưa khớp hoặc không đọc được điểm. Không tiếp tục
tra lại nhiều vòng để cố tìm đủ rating. Các kết quả/lịch sử cũ được giữ nguyên.

Chạy `node scripts/research-google-ratings.mjs --fast --workers=1 --batch-size=25 --browser-lite`.
Chế độ nhanh chỉ mở tối đa một ứng viên có tên/tọa độ phù hợp, chờ điều hướng tối đa
12 giây và panel 8 giây, không nới điều kiện xác minh. Chỉ tra sân chưa có file kết quả;
không cho kết hợp `--fast` với `--retry-incomplete`. CSV tổng hợp được tạo sau mỗi
100 sân và khi kết thúc, thay vì quét toàn bộ dữ liệu sau mỗi lượt theo dõi.
`skipped_in_fast_mode` là dấu hiệu bỏ qua trong lượt nhanh, không phải bằng chứng
sân không có đánh giá. Không ghi Firebase, production hoặc import rating vào ứng dụng.

Kiểm tra chỉ đọc Supabase ngày 10/10/2026: tổng 1.912 cơ sở, 54 cơ sở có rating
trong cột công khai hoặc JSON import; 1.858 cơ sở chưa có điểm. Mẫu VN_1859 có
rating 4,9; VN_1860 có rating 4,8; VN_0001 không có rating. Không có thao tác ghi
dữ liệu trong lần kiểm tra này.

Thẻ sân, modal chi tiết và modal đặt sân dùng chung `GoogleRating`. Component
hiển thị điểm hiện có; khi thiếu điểm chỉ hiện link Maps, không có thông báo thiếu rating.
Catalogue chỉ lấy các trường rating công khai từ raw_data, không đưa cả JSON vào
cache. Phiên bản cache v6 loại bỏ cache cũ không có các trường rating import.

Catalogue `src/data/venues.json` chứa rating cho toàn bộ cơ sở, nhưng chưa có
bằng chứng các điểm đó được xác minh. Không dùng file này để điền điểm còn thiếu
trên production. Muốn bổ sung 1.858 cơ sở cần nguồn đánh giá đáng tin cậy, đúng
cơ sở và có provenance; không gán điểm 0 hoặc số giả để làm đầy giao diện.

Script chẩn đoán dùng anonymous key, không dùng Firebase hoặc service-role key:

```powershell
node scripts/check-public-ratings.mjs --summary
node scripts/check-public-ratings.mjs --ids=VN_0001,VN_1859,VN_1860
```

Các lệnh này phát sinh đọc Supabase thật. Chúng không chạy trong bộ test offline.
Sửa frontend không tự deploy hoặc cập nhật rating trên server.

## Kết quả tìm nguồn

Rà soát offline toàn bộ 1.912 cơ sở bằng `node scripts/inventory-venue-ratings.mjs`:
54 cơ sở có điểm trong export, 7 cơ sở thiếu điểm có ứng viên từ bản Google Maps
đã lưu, 1.851 cơ sở còn cần tìm nguồn. Chi tiết từng cơ sở, địa chỉ, link tra cứu
và bằng chứng nằm trong `data_export/ratings/all-facilities-research.json`.
Script quét 148 file lookup; điểm chỉ được trích từ dòng ngay sau tên địa điểm.
Đối chiếu danh tính trước đây phục vụ tọa độ không thay thế xác minh rating hiện tại.
Đây chưa phải kết quả tìm kiếm trực tuyến đủ 1.912 sân; không có điểm mới được
ghi vào production, không đưa dữ liệu nghiên cứu vào luồng đặt sân.

Đợt đối chiếu Google Maps công khai cho toàn bộ catalogue được lưu riêng ở
`data_export/ratings/google-lookups/`. Chạy tiếp bỏ qua sân đã có kết quả; retry
giữ lịch sử thay vì xóa bằng chứng trước đó. Tối đa ba tab Chrome ẩn, không dùng
stealth, không vượt CAPTCHA; gặp access challenge thì dừng toàn bộ đợt đọc.

```powershell
node scripts/research-google-ratings.mjs --workers=3 --browser-lite
node scripts/research-google-ratings.mjs --workers=3 --browser-lite --retry-incomplete --query-mode=short-name --resolve-share-links
node scripts/report-google-rating-research.mjs
```

Hai file `google-research-progress.json` và `.csv` ghi tiến độ, điểm mới tìm được,
địa điểm chưa khớp, điểm không hiển thị và lỗi truy cập. Tên thương hiệu, địa chỉ
và tọa độ pin được đối chiếu; tọa độ camera không tính là pin. Không coi việc
không đọc được điểm là sân không có đánh giá. Chỉ ghi `verified_no_reviews` khi
trang địa điểm đúng sân nói rõ chưa có đánh giá. `verified_google_rating` là
đối chiếu tự động theo bằng chứng Maps, không có nghĩa đã import hoặc đã được
người dùng duyệt. File nghiên cứu không được app/backend import; không thay
đổi UI hay schema chung trong đợt tìm này.

Browser được khởi động mới sau mỗi 75 sân để giới hạn bộ nhớ, không phải để
vượt chặn truy cập. Báo cáo đếm riêng số địa điểm Google độc lập và liệt kê
các nhóm bản ghi sân trùng một địa điểm; nhiều địa điểm khớp nhưng có điểm
khác nhau được đánh dấu `ambiguous_google_places`, không chọn điểm đầu tiên.

`data_export/ratings/research-candidates.json` lưu ba ứng viên đối chiếu theo tên
và địa chỉ (XaLa, Cầu Đơ, Việt Hàn Geleximco), nguồn bài viết và xung đột giữa
các nguồn. Đây là dữ liệu nghiên cứu, chưa được import hoặc nối vào frontend.
Điểm trong bài tổng hợp không chứng minh điểm Google hiện tại. Cầu Đơ có hai
điểm khác nhau; Master Bros Hà Đông khác chi nhánh Nguyễn Xiển, nên không gán
chéo điểm cho nhau. Sân thiếu rating vẫn chỉ hiện link Google theo yêu cầu.
