# Kiểm kê và bổ sung tọa độ sân

## Kết quả đợt kiểm kê ngày 03/10/2026

- Tổng cộng 1.912 sân: 1.785 sân đã có tọa độ, 127 sân thiếu.
- Đã đối chiếu và ghi thành công 76 tọa độ mới vào Firestore; không có bản ghi bị bỏ qua do thay đổi đồng thời. Mỗi bản ghi có nguồn và thời điểm tra cứu.
- Hiện 1.861 sân có tọa độ; còn 51 sân cần xác minh địa chỉ hoặc địa điểm. Không gán tọa độ phỏng đoán cho các sân này.
- `src/data/venues.json` cũng có 1.861 tọa độ. Giữ nguyên 1.785 tọa độ cũ và toàn bộ trường không liên quan.
- Quota: một lần lấy snapshot gồm 1.912 document, sau đó tra cứu hoàn toàn từ file; bước cập nhật gồm 76 lượt ghi, không đọc thêm. Không dùng API Google có phí.
- Kiểm chứng: 3 kiểm thử xử lý tọa độ đạt; đối chiếu dữ liệu trước/sau đạt; `npm run build` thành công. Xác nhận ghi bằng phản hồi của Firestore và nhật ký cục bộ, không quét lại để kiểm tra.

Danh sách [76 sân đã bổ sung](data/toa-do-san-da-doi-chieu.csv) có tọa độ và link nguồn. Danh sách [51 sân còn thiếu](data/san-thieu-toa-do.csv) có lý do và link tra cứu. Ví dụ cần sửa địa chỉ: `VN_1796`, `VN_1798`, `VN_1805`, `VN_1806`, `VN_1816` có kết quả tại Lào Cai nhưng dữ liệu hiện ghi Vĩnh Long/Trà Vinh.

## Nguyên tắc tiết kiệm quota

- Snapshot Firestore nằm tại `data_export/coordinates/firestore-snapshot.json`. Chỉ tạo khi chưa có file và gọi rõ `--fetch-once`; không tự hết hạn hoặc quét lại khi chạy tiếp.
- Một document trả về vẫn tính một lượt đọc dù chỉ chọn vài trường. Đợt kiểm kê ban đầu có 1.912 document; lấy ít trường chỉ giảm dung lượng truyền.
- Tra cứu tọa độ và đối chiếu dùng snapshot, không gọi Firebase. Mỗi truy vấn bản đồ được lưu riêng trong `data_export/coordinates/lookups`.
- Bước cập nhật chỉ ghi các sân thiếu đã được đối chiếu. Dùng `lastUpdateTime` từ snapshot, không đọc lại document. Nếu dữ liệu đã thay đổi thì bỏ qua để tránh ghi đè.
- File cục bộ `src/data/venues.json` được bổ sung tọa độ từ snapshot và kết quả đối chiếu để lần sau có thể làm việc offline.

## Quy trình

```powershell
# Mặc định dùng bản kiểm kê đã có; không gọi Firebase.
node scripts/inventory-venue-coordinates.mjs

# Chỉ cần khi CHƯA có snapshot. Không xóa snapshot để chạy lại tùy tiện.
node scripts/inventory-venue-coordinates.mjs --fetch-once

# Tra cứu các sân thiếu từ snapshot; bỏ qua truy vấn đã lưu.
node scripts/find-venue-coordinates.mjs

# Sau khi đối chiếu và ghi review-decisions.json:
node scripts/report-venue-coordinates.mjs
node scripts/apply-venue-coordinates.mjs
node scripts/apply-venue-coordinates.mjs --apply-local
```

`scripts/geocodeVenues.js` và `scripts/scrapeCoordinates.js` là các lối gọi tương thích đến quy trình mới; không còn tự đọc toàn bộ Firebase rồi ghi kết quả tìm kiếm đầu tiên.

Cập nhật Firestore cần thêm `--apply-firestore --project=sportspace-af6b4 --credentials=<đường-dẫn-key-cục-bộ>`. Key không đưa vào source hay báo cáo. Nhật ký ghi thành công nằm trong `data_export/coordinates/firestore-applied.jsonl`; chạy tiếp sẽ bỏ qua các ID đã ghi ở cùng snapshot.

## Độ chính xác và nguồn

Chỉ lấy điểm địa điểm cụ thể `!3d...!4d...` trong URL Google Maps. Không lấy `@lat,lng` vì đó là tâm khung nhìn, không chắc là vị trí sân. Không dùng tâm đường/phường/tỉnh để lấp dữ liệu thiếu.

Mỗi tọa độ mới có URL, tên, địa chỉ trên nguồn, thời điểm tra cứu và ghi chú đối chiếu. Điểm đại diện cho nhà thi đấu/cơ sở chung được ghi `precision: facility`; không khẳng định đó là tâm sân con. Tọa độ có sẵn được giữ nguyên, chưa được tái xác minh trong đợt này.

Các kết quả lệch tên, khác số nhà, trùng nhiều địa điểm hoặc mâu thuẫn tỉnh được giữ trong danh sách chờ. Xem `docs/data/san-thieu-toa-do.csv` và `docs/data/toa-do-san-da-doi-chieu.csv`. Danh sách đã đối chiếu máy đọc được nằm tại `src/data/venue-coordinates.json`.

Không dùng Google Places API có phí. Các lần tra cứu là trang bản đồ công khai, tuần tự; dừng nếu gặp yêu cầu xác minh truy cập.
