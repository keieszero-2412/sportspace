# Mở rộng nguồn giá sân — 04/10/2026

Đã bổ sung **204 mã sân**, nâng độ phủ từ **14 lên 218/1.912 mã (11,40%)**. Còn **1.694 mã chưa có giá được chấp nhận**. Không khẳng định đã tìm hết Internet hoặc các mức này còn hiệu lực.

Hai file giá đã cập nhật: `gia-san-nguon-cong-khai.csv` có 238 dòng giá; `gia-san-nguon-cong-khai-toan-bo.csv` có 1.932 dòng, bao phủ đủ 1.912 mã, gồm cả trạng thái thiếu giá.

## Phạm vi đã làm

- Đọc lại 928 HTML đã lưu từ các nguồn công khai, gồm mục giá trong bài riêng, bài tổng hợp và trường giá của danh bạ.
- Đọc sitemap TheGioiTheThao có 3.665 URL sân; tải 1.815 trang ứng viên khớp tên danh mục, có cache và giới hạn tốc độ.
- Rà 425 dòng ứng viên tự động; bổ sung 6 dòng đọc thủ công. Duyệt 193 dòng mới; 238 dòng còn lại gồm nguồn trùng, ghép sai, thiếu thông tin hoặc mức giá khác cần đối chiếu, không phải 238 sân chưa xử lý riêng biệt.
- Chỉ dùng snapshot cục bộ để ghép mã. **Không đọc hoặc ghi Firebase.**

Nguồn trong tập giá chính: TheGioiTheThao, ALOBO, Địa Điểm 247, VNB, VS Sports, Tuấn Việt và các dòng Sporta có từ trước. Mỗi dòng có URL nguồn. Ví dụ: [Sport One trên TheGioiTheThao](https://thegioithethao.vn/san-bong-da-sport-one-f-NZyKQ), [Hue Pickleball Arena trên ALOBO](https://www.alobo.vn/san-cau-long-thua-thien-hue-pickleball-thua-thien-hue/).

## Độ phủ theo nhãn môn của danh mục

| Môn trong snapshot | Tổng mã | Có giá tham khảo | Có giá cả sân/giờ, không lệch môn nguồn |
|---|---:|---:|---:|
| Pickleball | 340 | 170 | 129 |
| Cầu lông | 349 | 12 | 7 |
| Bóng đá | 1.131 | 30 | 1 |
| Bóng rổ | 30 | 1 | 1 |
| Tennis | 10 | 5 | 2 |
| Bóng bàn | 32 | 0 | 0 |
| Bóng chuyền | 18 | 0 | 0 |
| Thể thao tổng hợp | 2 | 0 | 0 |

141 mã có mức giá cả sân theo giờ; 77 mã còn lại chỉ có giá theo trận hoặc thiếu thời lượng. Trong nhóm có giá có một sân mang nhãn danh mục khác môn ở nguồn (tennis Không Quân, VN_0738); thống kê giá theo môn loại trường hợp lệch môn này. Không tự sửa nhãn của snapshot.

Mốc 50% hiện đạt cho **Pickleball: 170/340 mã (50,00%)** và **Tennis: 5/10 mã (50,00%)**. Các môn còn lại chưa đạt vì nguồn công khai tìm được không khớp đủ mã sân trong snapshot; không dùng giá trung bình thị trường để lấp các mã thiếu.

## Các giới hạn quan trọng

- Đây là **giá tham khảo công khai**, không phải dữ liệu đã xác nhận để tính tiền đặt sân. Khoảng giá không được biến thành giá cho từng giờ/ngày.
- Thiếu thời lượng: `court_unknown_duration`; theo trận nhưng chưa rõ số phút: `court_match`. Không mặc định 60 phút.
- Nguồn cũ: Chuyên Việt có giá theo giờ nhưng ghi cập nhật 21/06/2021; đánh dấu `historical_reference`, độ tin cậy thấp. Các mục danh bạ khác cũng có thể cũ. [Nguồn Chuyên Việt](https://diadiem247.com/da-nang/san-bong-chuyen-viet-l371066.html).
- SeventySeven tách cả sân/nửa sân, ngày chưa rõ. Nguồn có mâu thuẫn giờ mở cửa 07:00 và bảng giá từ 06:00; đã ghi chú, không khẳng định đặt được lúc 06:00. [Bảng giá nguồn](https://tuanviet.vn/danh-sach-san-bong-ro-thanh-pho-ho-chi-minh).
- Độ phủ đếm **mã danh mục**, không phải số cơ sở ngoài thực tế đã loại trùng. Có các cặp nghi trùng như Đảo Sen, DSD Nha Trang, Chùa Nôm.
- Các nguồn khác mức giá được giữ ở hàng đợi đối chiếu; không lấy min của nguồn này và max của nguồn khác để tạo bảng giá tổng hợp giả.
- LOOL đã được kiểm tra mẫu nhưng có nhãn môn không nhất quán ở BallBurn; chưa đưa giá mẫu đó vào tập chính. Eduoka cho Tennis CA Quận 1 chỉ ghi đang cập nhật; mức 0–0 trên một danh bạ tennis không được coi là miễn phí.

## Kiểm tra

- `node scripts/validate-public-prices.mjs`: kiểm tra CSV, đủ mã sân, đơn vị, khung giờ, truy vết duyệt và một số phép ghép sai đã biết.
- `node scripts/merge-expanded-prices.mjs`: hợp nhất có tính lặp lại, không thêm trùng `candidate_id`.
- `node scripts/report-public-price-stats.mjs`: cập nhật thống kê, loại đơn vị không tương thích và lệch môn. Mean/median dựa vào trung điểm khoảng giá, không phải trung bình doanh thu hay lịch thuê thực tế.
- `npm.cmd run build`: thành công.

Các số liệu máy đọc được nằm trong `bao-cao-gia-san-nguon-cong-khai.json`; quyết định ghép nguồn nằm trong `doi-chieu-gia-bo-sung.json`.
