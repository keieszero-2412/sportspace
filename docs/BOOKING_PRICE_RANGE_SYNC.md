# Đồng bộ price range sang giá booking

Đã được người dùng duyệt và áp dụng ngày 12/10/2026.

- Run: `54d5bc1a-6e23-40f6-9405-bdb372a0e472`.
- 1.910 sân, 7.371 sân con đã cập nhật; không còn chênh lệch trong nhóm có price range hợp lệ.
- `Courts.basePrice` và `price_day` = `Facilities.raw_data.price_reference.min`.
- `price_weekend` = max; `price_night` = peak (min × 1,2 làm tròn 10.000đ).
- Đồng bộ cả giá native và `Courts.raw_data`, cập nhật phiên bản `updatedAt` đúng kiểu timestamp của schema.
- Giá cuối tuần được ưu tiên, không cộng thêm cao điểm. Ngoài giờ cao điểm quay về giá ngày thường. Khung cao điểm theo `Facilities.pricing`, mặc định 17:00–21:00.
- Không sửa đơn, cọc, thanh toán, snapshot của booking đã tạo. Không thay đổi dữ liệu sân ngoài giá và timestamp; giao dịch có kiểm tra toàn vẹn trước commit.
- `VN_0422`, `VN_1038` chưa có price range: giữ nguyên giá booking cũ, không tự ngoại suy thêm.
- Giá cũ được lưu trong bảng riêng `CourtPriceSyncHistory`, RLS bật, không cho anon/authenticated truy cập. Có thể khôi phục theo run sau khi người dùng duyệt thao tác phục hồi.

Việc này thay thế giới hạn “chỉ giá tham khảo, không đổi checkout” trong đợt nghiên cứu giá trước. Metadata nguồn/ước tính trên Facilities được giữ nguyên. Checkout vẫn dùng giá Courts; không phân tích chuỗi price_summary để tính tiền.

Utility: `node scripts/admin/sync-booking-price-range.mjs` chỉ audit; thêm `--apply` là thao tác ghi và cần được cho phép. Không tự chạy lại: thay đổi price range sau này cần được đồng bộ theo lần duyệt riêng.

16 kiểm thử liên quan và frontend build đã thành công. Database áp dụng ngay; thay đổi nhãn bảng giá frontend cần deploy riêng.
