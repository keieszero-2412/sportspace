# Giá sân thu thập từ nguồn công khai

`gia-san-nguon-cong-khai.csv` là tập dữ liệu tham khảo được đối chiếu với snapshot cơ sở cục bộ. File này chưa được nhập vào Firebase hoặc dữ liệu vận hành.

`gia-san-nguon-cong-khai-toan-bo.csv` hợp nhất giá đã đối chiếu và trạng thái quét của toàn bộ danh mục. File có ít nhất một dòng cho mỗi mã sân, gồm cả sân chưa tìm thấy giá. Một sân có thể có nhiều dòng giá/khung giờ. Đếm mã `facility_id` duy nhất để tính độ phủ, không đếm số dòng; danh mục có thể chứa nhiều mã trùng cơ sở thực tế.

Các cột `day_group`, `start_time`, `end_time` chỉ được điền khi nguồn liên kết trực tiếp ngày/giờ với giá theo giờ:

- `mon-fri`: trong tuần;
- `sat-sun`: cuối tuần;
- `mon-sun`: áp dụng mọi ngày;
- `unknown`: nguồn không nói rõ nhóm ngày, có thể cũng chưa nêu khung giờ.

Các dòng `price_found` chỉ là ứng viên cần rà soát; không được dùng trực tiếp để tính tiền. `no_public_price` chỉ có nghĩa là không tìm thấy giá trên `source_url` đã quét, không khẳng định toàn bộ Internet không có giá của sân đó.

`status=curated_public_price` là giá công khai đã đối chiếu nhận dạng sân, không phải giá checkout đã được xác nhận. `verification_status=public_source_matched` phân biệt các dòng bổ sung với các dòng rà soát trước đây. `source_verified` trong dữ liệu cũ cũng không đồng nghĩa với giá hiện hành được chủ sân xác nhận.

Chạy lại bộ thu thập nguồn gốc bằng `node scripts/collect-public-venue-prices.mjs`, rồi chạy `node scripts/merge-expanded-prices.mjs` để hợp nhất lại các giá bổ sung. Bộ thu thập gốc dùng cache `data_export/public-prices/pages`; `--refresh` sẽ truy cập mạng. Không cần và không được tự ý truy cập Firebase.

## Nguồn bổ sung và quy trình rà soát

- `scripts/discover-booking-prices.mjs`: GET sitemap/trang công khai có giới hạn tốc độ; cache tại `data_export/price-expansion`.
- `scripts/expand-public-prices.mjs --local-only`: đọc HTML đã lưu từ VNB, ALOBO và danh bạ; tách mục giá theo từng sân.
- `scripts/review-expanded-prices.mjs`: tạo `ung-vien-gia-tu-nguon-bo-sung.csv`. Đây là hàng đợi có thể chứa ghép sai, nguồn trùng hoặc giá mâu thuẫn; **không nhập thẳng vào vận hành**.
- `doi-chieu-gia-bo-sung.json`: danh sách `candidate_id` được duyệt sau khi đọc tên/địa chỉ/môn và bằng chứng. Các ứng viên ngoài danh sách không tự động được chấp nhận.
- `scripts/merge-expanded-prices.mjs`: chỉ thêm các ứng viên được duyệt; chạy lại không nhân đôi dòng. Cập nhật hai CSV giá và báo cáo độ phủ JSON.
- `scripts/report-public-price-stats.mjs`: thống kê lại; không tính giá thiếu đơn vị hoặc lệch môn nguồn/danh mục. Khoảng giá dùng trung điểm, cận dưới đơn lẻ không đưa vào mean/median.

Giá ở bài tổng hợp có thể khác bài riêng hoặc trang đặt sân. Tập giá chính chọn một mức tham khảo theo nguồn cho mỗi mã mới; các nguồn còn lại được giữ trong hàng đợi, không gộp min/max giữa các nguồn thành một bảng giá mới.

## Đơn vị và môn

- `court_hour` + `unit_minutes=60`: nguồn nói rõ giá thuê sân theo giờ.
- `half_court_hour`: thuê nửa sân bóng rổ theo giờ; không đưa vào thống kê giá thuê cả sân.
- `court_match`: giá theo trận; để trống `unit_minutes` nếu chưa biết số phút.
- `court_unknown_duration`: nguồn chỉ ghi giá sân, chưa rõ thời lượng. Tuyệt đối không mặc định một giờ.
- `source_sport` ghi môn nhận diện ở nguồn. Không sửa nhãn môn của snapshot. Nếu khác môn danh mục, không đưa giá này vào thống kê theo nhãn cũ.
- `source_name`, `source_address`, `retrieved_at`, `candidate_id` giúp truy vết phép ghép. Thiếu ngày xuất bản thì để trống, không dùng ngày thu thập thay thế.
- `historical_reference`: mức giá từ nguồn cũ đã biết; không xem là báo giá hiện hành. Một số nguồn danh bạ khác cũng có thể cũ dù chưa trích được ngày cập nhật.
- Các nguồn đọc thủ công bổ sung được lưu trong `manual_candidates` của file đối chiếu, kèm URL và dữ liệu đã diễn giải; không nằm trong hàng đợi tự động.

## Ý nghĩa `precision`

- `time_slots`: nguồn công khai nêu khung giờ và giá; nhóm ngày có thể vẫn là `unknown`.
- `price_range_only`: nguồn chỉ nêu khoảng giá. Các dòng này không đủ để tính giá checkout theo ngày/giờ.
- `price_only`: một mức giá, chưa gắn đủ lịch áp dụng.
- `lower_bound`: giá từ một mức; không biết cận trên.

## Quy tắc sử dụng

- Chỉ ghép nguồn vào `facility_id` khi tên và địa chỉ đủ khớp.
- Không tự suy ra khung giờ từ một khoảng giá.
- `medium` nghĩa là có nguồn công khai và nhận dạng cơ sở đủ khớp, nhưng chưa được chủ sân hoặc giao dịch thực tế xác nhận.
- `observed_at` là ngày kiểm tra nguồn, không phải ngày giá bắt đầu có hiệu lực.
- Trước khi dùng cho đặt sân hoặc thanh toán, cần kiểm tra lại nguồn và xác nhận giá tại thời điểm giao dịch.
