# Giá tham khảo và ngoại suy sân

Ngày thực hiện: 11/10/2026. Supabase là nguồn chính; không truy cập Firebase,
không khôi phục export/dataset local, không triển khai frontend hoặc Edge Function.

Audit Supabase: `VenueReviewCatalog.payload.priceBulkResolution`, run
`0091ab17-0260-4acb-af8e-dc8f0a9e6fc3`. Ghi 1.910 sân, không có xung đột đồng thời.
Chỉ sửa `Facilities.price_summary` và `raw_data.price_summary/price_reference`;
mọi trường native và raw_data khác được đối chiếu trong từng transaction.
Giá 7.377 Courts được fingerprint trước/sau để xác nhận không thay đổi.
Xác minh cuối: 1.910 bản ghi hợp lệ, fingerprint Courts trùng khớp.
Lịch sử lưu trong `VenueDataReviews`, không xóa giá trước đó khỏi lịch sử.

| Môn | Có nguồn theo giờ | Ngoại suy | Chưa xử lý | Cặp min/max khác nhau |
| --- | ---: | ---: | ---: | ---: |
| Pickleball | 129 | 211 | 0 | 260 |
| Cầu lông | 8 | 341 | 0 | 120 |
| Bóng đá | 2 | 1.129 | 0 | 187 |
| Tennis | 2 | 8 | 0 | 7 |
| Bóng rổ | 2 | 28 | 0 | 13 |
| Bóng bàn | 0 | 32 | 0 | 12 |
| Bóng chuyền | 1 | 17 | 0 | 11 |
| Thể thao tổng hợp | 0 | 0 | 2 | 0 |
| Tổng | 144 | 1.766 | 2 | — |

Hai bản ghi chưa đủ môn để ngoại suy: `VN_0422` (Dt0A0F), `VN_1038`
(San Bong Cd Du Lich). Không lấy giá seed chưa có chứng cứ làm mẫu.

## Quy tắc

- Ngưỡng đối chiếu tên/địa chỉ 0,5 là điểm tương đồng, không phải độ chính xác
  thống kê 50%. Tên chung chung hoặc môn mâu thuẫn vẫn bị loại.
- Chỉ dùng tiền thuê một sân/bàn trong 60 phút. Không trộn người/lượt/tháng,
  học phí, thuê vợt, nửa sân, gói dịch vụ hoặc trận chưa rõ thời lượng.
- Ngày thường = min, cuối tuần = max theo yêu cầu. Khi nguồn chỉ nêu khoảng
  theo giờ mà không chia ngày, `scheduleAssumed=true`; không coi đó là lịch
  giá đã xác minh. Nguồn có các mức khác nhau được giữ chứng cứ gốc.
- Cao điểm = `Math.round(min * 1.2 / 10000) * 10000`: 130.000 × 1,2 =
  156.000 → 160.000đ. Đây là mức tính theo yêu cầu, không nhất thiết bằng
  giá cao điểm nguồn công bố (`peakComputed=true`).
- Ngoại suy cùng môn, tối đa tám mẫu, ưu tiên tỉnh và trọng số theo khoảng
  cách. Nếu tỉnh có dưới ba mẫu thì dùng thêm mẫu ngoài tỉnh. Min/max ngoại
  suy làm tròn 1.000đ; cao điểm làm tròn 10.000đ.
- Một số nguồn thị trường ngoài danh mục được giữ riêng ở
  `payload.priceMarketReferences`. Tâm nhóm tọa độ cùng tỉnh chỉ là điểm neo
  ngoại suy (`province_cohort_centre`), không phải tọa độ sân nguồn; tuyệt đối
  không ghi tọa độ này vào Facilities.
- Có thể trùng giá nếu dữ kiện tương tự hoặc mẫu ít. Không thêm nhiễu random,
  băm ID, hoặc bịa phụ phí để ép khác giá. Bóng đá và bóng bàn đặc biệt ít mẫu;
  không bảo đảm các mức ngoại suy sát giá thực tế từng sân.
- Trong đợt áp dụng này chưa có bản ghi được bộ đối chiếu xác nhận đủ cả hai
  lịch ngày thường/cuối tuần: tất cả phân ngày đang mang cờ ước tính. Nhóm
  trùng lớn nhất là 96 sân bóng đá cùng khoảng 238.000–396.000đ; yêu cầu hạn
  chế trùng đã cải thiện so với giá seed nhưng chưa thể bảo đảm không có nhóm
  trùng lớn nếu không thu thập thêm nhiều mẫu thực tế.
- `checkoutPrice=false`: không thay đổi `Courts.basePrice/price_day/price_night/
  price_weekend`, Facilities.pricing, booking, thanh toán hay chuyển khoản.

## Nguồn mới bổ sung

- [Decathlon: sân bóng bàn](https://www.decathlon.vn/blog/san-bong-ban/):
  chỉ lấy thuê **riêng bàn**, không lấy mức chơi chung hoặc học cá nhân.
- [Decathlon: Mậu Lương](https://www.decathlon.vn/blog/san-bong-mau-luong/):
  bảng giá theo giờ, có mức cuối tuần riêng; giữ cả mức cao điểm nguồn công bố.
- [Decathlon: Quyền Đào Duy Anh](https://www.decathlon.vn/blog/san-bong-da-mini-quyen-dao-duy-anh-2/):
  chỉ lấy khoảng sân năm người, không gộp giá sân bảy người vào khoảng này.
- [Decathlon: chi phí bóng chuyền](https://www.decathlon.vn/blog/bong-chuyen-bao-nhieu-tien/):
  khảo sát sân trong nhà/ngoài trời, không gán thành báo giá một sân cụ thể.
- [Decathlon: Long Biên](https://www.decathlon.vn/blog/san-pickleball-long-bien/),
  [ShopVNB: cầu lông Quận 12](https://shopvnb.com/danh-sach-cac-san-cau-long-quan-12-cap-nhat-moi-nhat-2020.html).

Đã rà hơn 1.100 URL nguồn đã biết, tái sử dụng cache cloud, timeout 7 giây,
ba worker; không vượt chặn 403/429/challenge. Không tuyên bố đã tìm hết Internet.
Một lượt đối chiếu ban đầu bắt nhầm tên chung; ứng viên live của lượt đó đã
được loại khỏi queue, chạy lại bộ lọc môn/tên. Chưa áp dụng giá trước sửa bộ lọc.

## Kiểm thử / chạy lại

144 test offline qua; build Vite qua. Không chạy test tích hợp Firebase.
Frontend mới có nhãn nguồn/ước tính, đủ ba mức giá và cảnh báo không phải
báo giá checkout. Admin giữ nguyên dashboard, thêm phân biệt giá ngoại suy.
Thay đổi mặc định công thức cho lần admin duyệt giá tiếp theo nằm trong mã
Edge Function, chưa triển khai lên dịch vụ đang chạy.

`node scripts/resolve-venue-prices.mjs --verify` chỉ đọc Supabase.
`node scripts/resolve-venue-prices.mjs` lập kế hoạch, không ghi giá.
`--apply` tạo lịch sử duyệt mới, vì vậy không chạy lại tùy tiện khi chưa cần.
Tất cả nguồn, giá từng sân và audit chi tiết ở Supabase, không tạo export local.

## Điều chỉnh hiển thị theo yêu cầu tiếp theo

Website (bao gồm màn hình admin) không còn hiện nhãn/ghi chú giá ước tính.
Giữ nguyên metadata `estimated`, `method`, `scheduleAssumed`, nguồn và lịch
sử trên Supabase; chỉ thay đổi trình bày. Ba mức giá và giá booking không đổi.
Điều chỉnh này thay thế mô tả nhãn hiển thị trong phần kiểm thử phía trên.
