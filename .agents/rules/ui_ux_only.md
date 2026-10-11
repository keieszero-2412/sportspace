# QUY TẮC PHẠM VI: CHỈ CHỈNH SỬA UI/UX (UI/UX ONLY)

> **Mục tiêu**: Tuyệt đối bảo toàn mọi luồng logic nghiệp vụ của hệ thống SportSpace. Toàn bộ công việc trong session này chỉ tập trung vào việc cải thiện, tinh chỉnh Giao diện người dùng (UI) và Trải nghiệm người dùng (UX).

---

## 1. Phạm vi Được phép Can thiệp (Allowed UI/UX Changes)
- **Bố cục & Styling**: Tinh chỉnh CSS, Tailwind classes, CSS modules, inline styles cho component.
- **Hệ thống Design System**:
  - Tối ưu hóa màu sắc, độ tương phản (Contrast), hỗ trợ Dark/Light mode chuẩn xác.
  - Căn chỉnh Spacing (margin, padding, gap), typography (font-size, font-weight, line-height).
  - Phong cách Glassmorphism, đổ bóng (box-shadow), viền (border), bo góc (rounded).
- **Trải nghiệm tương tác (Micro-interactions)**:
  - Hiệu ứng chuyển động (transition, CSS animations, transform).
  - Trạng thái trực quan: `:hover`, `:active`, `:focus-visible`, disabled styling.
- **Chống giật Layout (Layout Shift)**:
  - Áp dụng `min-width` cố định cho các nút có nhãn thay đổi trạng thái động.
  - Dùng Skeleton loaders thay vì spinner giật cục khi chờ dữ liệu.
- **Responsive & Zoom**:
  - Đảm bảo hiển thị hoàn hảo trên Mobile, Tablet, Laptop, Desktop.
  - Ngăn tràn viền ngang và vỡ giao diện ở mức zoom 50% - 200%.
- **Thành phần hiển thị**: Tinh chỉnh visual của Modal dialogs, Toast notifications, Badge, Tooltips, Cards, Form controls.

---

## 2. Phạm vi Tuyệt đối Nghiêm cấm (Forbidden Changes)
- **KHÔNG thay đổi Business Logic**:
  - Không sửa đổi logic tính tiền sân, phụ thu, chiết khấu.
  - Không sửa đổi logic đặt sân, giữ chỗ (hold time), hủy sân, hoàn tiền.
  - Không sửa đổi logic ghép đội, thuật toán chấm điểm matchmaking, tính khoảng cách Haversine.
  - Không thay đổi quy trình xác thực, phân quyền (user / merchant / admin), duyệt đơn.
- **KHÔNG can thiệp Service & API Layer**:
  - Không sửa các file trong `src/services/` (`api.js`, `publicVenues.js`, `matchFeed.js`, `profileData.js`, v.v.).
  - Không sửa Edge Functions (`supabase/functions/`), Cloud Functions (`functions/`), Database migrations, RLS rules.
- **KHÔNG phá vỡ Contracts & Event Handlers**:
  - Giữ nguyên toàn bộ props contract truyền giữa các React components.
  - Không thay đổi hoặc xóa các callback sự kiện (`onClick`, `onSubmit`, `onSelectSlot`, v.v.) đang kích hoạt xử lý dữ liệu.
- **KHÔNG can thiệp dữ liệu**:
  - Tuân thủ quy tắc không tự ý đọc/ghi/xóa dữ liệu Firebase/Supabase nếu chưa có sự đồng ý rõ ràng.
  - Không tự tạo mock data hay ghi đè dữ liệu thật.

---

## 3. Tiêu chuẩn Kiểm thử & Nghiệm thu sau mỗi thay đổi UI/UX
- Đảm bảo `npm run build` thành công, không phát sinh lỗi cú pháp hay thiếu import.
- Kiểm tra tính toàn vẹn của các luồng hoạt động thông qua caller/call-site liên quan.
