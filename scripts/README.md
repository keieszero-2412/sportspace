# SportSpace CLI & Operational Scripts

Thư mục chứa các công cụ dòng lệnh (CLI), kịch bản đối soát dữ liệu và tiện ích vận hành của dự án SportSpace.

---

## Cấu trúc thư mục

### 1. `scripts/audit/` — Kiểm tra & Báo cáo chất lượng dữ liệu
* `audit-data.mjs`: Đối soát dữ liệu offline.
* `audit-venue-image-resolution.mjs`: Kiểm tra độ phân giải và chất lượng ảnh sân.
* `audit-venue-prices.mjs`: Kiểm tra tính hợp lệ của biểu phí sân.
* `check-public-directory.mjs`: Kiểm tra thư mục sân công khai trên Firebase.
* `check-public-ratings.mjs`: Đối chiếu điểm đánh giá rating công khai.
* `inventory-venue-ratings.mjs`: Tổng hợp và bóc tách kho điểm đánh giá Google Maps.
* `report-venue-data-gaps.mjs`: Báo cáo danh sách sân còn thiếu số điện thoại, giá, ảnh.
* `report-venue-phone-coverage.mjs`: Thống kê tỷ lệ phủ sóng số điện thoại của hệ thống sân.

### 2. `scripts/research/` — Nghiên cứu & Làm giàu dữ liệu sân bãi
* `auto-review-venue-phones.mjs`: Tự động duyệt các số điện thoại có độ khớp cao.
* `inspect-archived-phone-sources.mjs`: Rà soát các nguồn số điện thoại đã lưu trữ.
* `preview-public-sport-photo.mjs`: Tải và xem trước ảnh thể thao từ nguồn công khai.
* `research-all-venue-phones.mjs`: Tra cứu số hotline / Zalo đặt sân.
* `research-price-market-references.mjs`: Tham chiếu khung giá thị trường theo từng bộ môn.
* `research-venue-images-live.mjs`: Tìm kiếm ảnh sân thực tế trực tiếp.
* `research-venue-prices-live.mjs`: Tìm kiếm biểu phí sân thực tế trực tiếp.
* `resolve-sport-illustrations.mjs`: Gán ảnh minh họa thể thao đặc thù.
* `resolve-venue-images.mjs`: Phê duyệt và gắn ảnh bản quyền hợp lệ vào sân.
* `resolve-venue-phones.mjs`: Phê duyệt số điện thoại đã xác minh.
* `resolve-venue-prices.mjs`: Chuẩn hóa và cập nhật bảng giá chính thức.
* `search-missing-venue-images.mjs`: Quét tìm kiếm ảnh cho các sân còn thiếu.

### 3. `scripts/admin/` — Quản trị viên, phân quyền & Layout Admin
* `check-admin-data-access.mjs`: Kiểm tra bảo mật truy cập dữ liệu trang admin.
* `check-admin-layout.mjs`: Kiểm thử offline giao diện trang quản trị Admin.
* `check-venue-review-admin-access.mjs`: Kiểm tra quyền duyệt sân của admin.
* `grant-approved-venue-admin.mjs`: Cấp quyền admin cho chủ sân/quản trị viên đã phê duyệt.
* `inspect-user-role-guard.mjs`: Kiểm tra cơ chế chặn truy cập trái phép theo role.
* `verify-admin-merchant-data.mjs`: Đối soát dữ liệu giữa merchant và admin.

### 4. `scripts/sync/` — Đồng bộ, chuyển đổi & Khôi phục dữ liệu
* `check-firebase-supabase-cutover.mjs`: Kiểm tra tiến độ cắt chuyển toàn diện từ Firebase sang Supabase.
* `restore-supabase-local-archive.mjs`: Phục hồi dữ liệu Supabase từ bản sao lưu cục bộ khi cần thiết.
* `verify-local-data-sync-security.mjs`: Đảm bảo an toàn không rò rỉ dữ liệu khi đồng bộ.
* `verify-venue-review-deployment.mjs`: Kiểm tra tính sẵn sàng khi deploy tính năng review.

### 5. `scripts/browser/` — Kiểm thử trình duyệt tự động (E2E)
* `auth-browser-test.mjs`: Kiểm thử luồng đăng nhập và quản lý profile trên Chromium thực (`npm run test:auth:browser`).
* `browser-smoke.mjs`: Smoke test nhanh các trang chính trên trình duyệt.

### 6. `scripts/lib/` — Thư viện nghiệp vụ dùng chung
* Chứa các module thuật toán (tính tọa độ GPS, chuẩn hóa giá, lọc số điện thoại, phân giải ảnh...) phục vụ cho các script và bộ test trong `test/`.
