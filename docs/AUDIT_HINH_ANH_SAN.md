# Audit hình ảnh sân

Ngày kiểm tra: 2026-10-05  
Nguồn kiểm tra: Firebase project `sportspace-af6b4`, collection `Facilities` (chỉ ID, tên, địa chỉ, tỉnh, môn và URL ảnh), đối chiếu dữ liệu bundled và nguồn web công khai.

## Kết quả tổng hợp

| Hạng mục | Số lượng | Tỷ lệ |
| --- | ---: | ---: |
| Tổng số cơ sở | 1.912 | 100% |
| Có URL ảnh | 1.912 | 100% |
| Dùng 7 ảnh Wikimedia minh họa chung | 1.844 | 96,44% |
| Có URL riêng theo cơ sở | 68 | 3,56% |
| URL duy nhất | 74 | — |
| URL riêng sai hoặc quá chung chung đã xác định | ít nhất 4 | — |

Không có ảnh nào nên được gắn nhãn “đã xác minh 100%” chỉ dựa trên URL. Một ảnh chỉ đạt trạng thái xác minh khi đồng thời khớp tên và địa chỉ, nguồn chỉ rõ đúng cơ sở, và dự án có quyền sử dụng hoặc được chủ sân cung cấp.

## Ảnh mock chắc chắn

| Loại ảnh | Số cơ sở |
| --- | ---: |
| Bóng đá tại Bloomington, Indiana (1995) | 1.131 |
| Chung kết đôi nam nữ Olympic 2012 | 347 |
| Pickle Pro Tour 2025 | 276 |
| Trận bóng bàn quốc tế | 32 |
| Mỹ - Trung tại Olympic Bắc Kinh 2008 | 30 |
| Brazil - Pháp môn bóng chuyền 2016 | 18 |
| Sân tennis University of Bath | 10 |

Các ảnh này chỉ mô tả môn thể thao, không phải ảnh của 1.844 cơ sở tương ứng tại Việt Nam.

## URL riêng sai hoặc chưa đủ bằng chứng

| ID | Cơ sở | Vấn đề |
| --- | --- | --- |
| `VN_0007` | Giảng Võ Club | URL hiện tại có tên file `be-boi-giang-vo-ha-noi-2.jpg`, là ảnh bể bơi; nguồn thay thế đúng tên và địa chỉ có tại PickleballPlus. |
| `VN_0025` | Volley Vibes, 962 Bạch Đằng | URL hiện tại có tên file `san-pickleball-ngoc-vu-2...`, không khớp tên sân; PickleballPlus và Thế Giới Thể Thao có album đúng địa chỉ. |
| `VN_0045` | HTL Pickleball Center | URL `san-pickleball-ha-noi-1.jpg` quá chung; Voltano và PickleballPlus có album ghi rõ 44 Hàm Tử Quan. |
| `VN_0047` | Wessie Haus Pickleball Club | URL hiện tại là ảnh tổng hợp từ bài “10 sân pickleball Hà Nội”; PickleballPlus có album riêng đúng Sân vận động Mỹ Đình. |

## Nguồn ứng viên khớp tên và địa chỉ

- Giảng Võ Club: https://pickleballplus.vn/san-tap/43
- Volley Vibes: https://pickleballplus.vn/san-tap/23
- Volley Vibes (nguồn đối chiếu thứ hai): https://thegioithethao.vn/san-volley-vibes-pickleball-club-f-efwV0
- HTL Pickleball Center: https://www.voltano.vn/place/htl-pickleball-center
- HTL Pickleball Center (nguồn đối chiếu thứ hai): https://pickleballplus.vn/san-tap/82
- Wessie Haus Pickleball Club: https://pickleballplus.vn/san-tap/72
- Đảo Sen Pickleball: https://toididau.net/place/dao-sen-pickleball/24455
- Master Bros: https://pickleballplus.vn/san-tap/25
- Sân Pickleball Lý Sơn: https://sportnet.vn/venues/san-pickleball-ly-son

Các URL trên chứng minh có ảnh gắn với đúng tên/địa chỉ, nhưng chưa chứng minh SportSpace được quyền sao chép hoặc hotlink ảnh. Cần xin phép chủ sân/đơn vị giữ bản quyền, hoặc yêu cầu chủ sân tải ảnh trực tiếp lên SportSpace.

## Storage

Không thể đọc danh sách metadata ở `venues_crawled/`: Firebase Storage trả `storage/unknown`. Không suy đoán rằng file không tồn tại; cần kiểm tra cấu hình bucket/rules trước một lần đọc riêng nếu tiếp tục.

## Quy trình thay ảnh an toàn

1. Không chạy lại `scripts/updateVenuesImages.js`: script chọn kết quả Bing đầu tiên và không xác minh danh tính hay bản quyền.
2. Đổi 1.844 ảnh mock sang placeholder trung tính, ghi rõ “Chưa có ảnh đã xác minh”.
3. Chỉ nhận ảnh do chủ sân upload hoặc ảnh có giấy phép sử dụng rõ ràng.
4. Lưu `imageSourceUrl`, `imageVerifiedAt`, `imageVerifiedBy`, `imageLicense` và `imageOwnerConfirmed` cùng URL ảnh.
5. Với ảnh từ web, đối chiếu tối thiểu hai dấu hiệu: tên + địa chỉ, hoặc tên + số điện thoại; không dựa vào tên file.
6. Lưu bản sao được cấp quyền trong Storage của SportSpace thay vì hotlink website bên thứ ba.

## Thu thập ứng viên từ Internet

Đã quét đủ 1.848 cơ sở cần thay ảnh bằng `scripts/discover-venue-images.mjs` qua ba lớp: danh bạ thể thao, website công khai khớp tên/địa chỉ, và kết quả bản đồ/mạng xã hội từ truy vấn chính xác.

- 766/1.848 cơ sở có ít nhất một ứng viên.
- Thu được 1.460 URL ảnh ứng viên.
- 838 URL có trang nguồn khớp tên và địa chỉ.
- 622 URL từ Google Maps/mạng xã hội khớp tiêu đề của truy vấn chính xác tên + địa chỉ, nhưng cần xem ảnh thủ công.
- 1.082 cơ sở chưa tìm được URL ảnh đạt điều kiện từ các nguồn công khai đã quét.
- Nguồn có độ tin cậy cao hơn gồm ShopVNB, PickleballPlus, Thế Giới Thể Thao, M7 Sport, SportNet và Voltano.

Danh sách máy đọc được nằm tại `docs/data/venue-image-candidates.json`; danh sách chưa tìm được nằm tại `docs/data/venue-image-unresolved.json`. Tất cả vẫn mang trạng thái ứng viên; chưa có xác nhận bản quyền hoặc quyền tái sử dụng.
