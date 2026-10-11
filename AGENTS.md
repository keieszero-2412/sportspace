# Quy tắc làm việc với Firebase

## Bắt buộc xin phép trước mọi thao tác dữ liệu

- Agent không được tự ý đọc (`read`), ghi/tạo/cập nhật (`write`) hoặc xóa (`delete`) bất kỳ dữ liệu nào trên Firebase khi chưa có sự cho phép rõ ràng của người dùng cho thao tác cụ thể đó.
- Quy tắc áp dụng cho Firestore, Realtime Database, Authentication, Storage, Cloud Functions và mọi dịch vụ Firebase có thể chứa hoặc làm thay đổi dữ liệu.
- Yêu cầu sửa mã nguồn, kiểm tra lỗi, chạy ứng dụng hoặc quyền đã cấp cho một thao tác Firebase trước đó không cho phép các thao tác Firebase khác hay các lần thao tác tiếp theo.
- Trước khi xin phép, Agent phải nêu rõ thao tác, project, collection hoặc tài nguyên, phạm vi dữ liệu và mục đích. Agent chỉ được thực hiện đúng phạm vi đã được cho phép.
- Khi có snapshot, cache, emulator, export hoặc dữ liệu cục bộ phù hợp, Agent phải dùng chúng để chẩn đoán và kiểm thử trước nhằm tránh quota và thay đổi dữ liệu thật.
- Sau một lần ghi hoặc xóa đã được cho phép, Agent không được tự đọc lại Firebase để xác minh nếu lần đọc đó chưa được người dùng cho phép riêng.

## Bảo toàn các luồng liên quan

- Khi sửa một luồng, Agent phải xác định các luồng dùng chung API, schema, component, service hoặc Edge Function trước khi thay đổi.
- Thay đổi phải được giới hạn trong phạm vi cần thiết, giữ tương thích ngược với các luồng không thuộc phạm vi yêu cầu và không thay đổi hành vi ngoài chủ đích.
- Trước khi kết thúc, Agent phải kiểm tra các caller/call site liên quan, chạy test và build/lint phù hợp; nếu không thể kiểm tra một luồng, phải nêu rõ giới hạn đó.
- Không dùng fallback im lặng, catch rộng hoặc thay đổi schema dùng chung nếu chưa đánh giá tác động và cập nhật toàn bộ nơi sử dụng.

## Quy tắc Phạm vi: CHỈ CHỈNH SỬA UI/UX (UI/UX ONLY)

- **Mục tiêu duy nhất**: Chỉ tinh chỉnh, nâng cấp Giao diện (UI) và Trải nghiệm người dùng (UX). Không được can thiệp hay thay đổi bất kỳ luồng nghiệp vụ nào khác.
- **Phạm vi ĐƯỢC PHÉP**:
  - Giao diện, bố cục (Layout, Flex, Grid, Spacing, Padding, Margin).
  - Màu sắc, typography, font chữ, độ tương phản, dark/light theme.
  - Hiệu ứng chuyển động (Transitions, CSS animations, micro-interactions, hover/focus/active states).
  - Tối ưu hiển thị responsive (Mobile, Tablet, Desktop) và zoom trình duyệt (50% - 200%).
  - Chống giật/nhảy layout (Layout Shift Prevention) theo quy tắc của dự án (cố định min-width nút bấm có dynamic text).
  - Nâng cấp visual của Modal, Toast notification, Badge, Card, Skeleton loading, Empty states.
  - Thẩm mỹ: Glassmorphism, hiệu ứng chiều sâu, viền, shadow theo design system hiện hữu.
- **Phạm vi TUYỆT ĐỐI NGHIÊM CẤM (KHÔNG THAY ĐỔI)**:
  - **Không sửa logic nghiệp vụ (Business logic)**: Giữ nguyên toàn bộ logic xử lý đặt sân, giữ chỗ (hold), hủy/hoàn cọc, ghép đội, tính giá/phụ thu, đối soát, tính khoảng cách địa lý (Haversine), phân quyền tài khoản.
  - **Không sửa luồng dữ liệu (Data flows)**: Giữ nguyên vẹn toàn bộ các hàm trong `src/services/` (`api.js`, `publicVenues.js`, `matchFeed.js`, `profileData.js`, v.v.), `src/utils/`, state management, caching và flow gọi hàm.
  - **Không sửa API / Backend**: Không can thiệp vào Edge Functions `supabase/functions/`, Cloud Functions `functions/`, Firebase Rules, Supabase Migrations/Schema.
  - **Không phá vỡ props/event contract**: Không xóa, đổi tên hoặc làm thay đổi ý nghĩa của các props, callbacks (`onClick`, `onSubmit`, `onSelect`, v.v.) đang xử lý business logic.
  - **Không tự ý thao tác dữ liệu**: Tuyệt đối tuân thủ quy tắc xin phép trước khi thao tác Firebase/Supabase; không tự ý thêm/xóa/sửa dữ liệu thật hay mock data.
  - **Bảo toàn 100% luồng**: Mọi sửa đổi UI/UX phải đảm bảo ứng dụng chạy mượt mà, giữ nguyên vẹn toàn bộ tính năng và hành vi vốn có.

