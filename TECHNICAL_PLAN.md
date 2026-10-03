# Technical Plan - SportSpace


## 1. Tổng quan kiến trúc và công nghệ (Tech Stack)

Hệ thống được thiết kế theo kiến trúc **Serverless & Microservices-oriented**, tận dụng hệ sinh thái đám mây của Firebase để đảm bảo khả năng mở rộng (scalability) tự động và tối ưu chi phí vận hành.

*   **Frontend (Client-side):**
    *   **Core:** React 18, Vite.
    *   **Styling:** CSS thuần kết hợp Tailwind CSS để tối ưu Glassmorphism UI (chế độ Sáng/Tối).
    *   **State Management:** React Hooks (`useState`, `useEffect`) kết hợp với LocalStorage Cache để giảm tải reads.
*   **Backend / API (Server-side):**
    *   **Runtime:** Node.js 22.
    *   **Functions:** Firebase Cloud Functions (Callable API & Scheduled Cron Jobs).
    *   **Architecture:** Xử lý logic nghiệp vụ phức tạp (như giữ chỗ, hủy đơn, đối soát) độc lập khỏi client.
*   **Database & Storage:**
    *   **Database:** Cloud Firestore (NoSQL, Real-time sync). Dữ liệu được phân mảnh hợp lý (Facilities, Courts, Matches, Users, Bookings).
    *   **Storage:** Firebase Cloud Storage (lưu trữ hình ảnh sân, biên lai chuyển khoản).
*   **Authentication:** Firebase Auth (Hỗ trợ Email/Password và khôi phục tài khoản).

---

## 2. Lộ trình phát triển (Roadmap)

### Giai đoạn 1: MVP (Đã hoàn thiện)
*   Quản lý xác thực người dùng (Khách, Chủ sân, Admin).
*   Tính năng đặt sân theo slot (30/60/120 phút), tự động khóa ô (hold) 10 phút để thanh toán.
*   Tải lên biên lai và quy trình đối soát thủ công từ chủ sân.
*   Tính năng ghép đội cơ bản (Matchmaking) với lọc theo ngày, môn thể thao và bộ lọc vị trí (tính toán khoảng cách Haversine).

### Giai đoạn 2: Nâng cấp ngắn hạn (Short-term)
*   **Thanh toán tự động:** Tích hợp cổng thanh toán (VNPAY / MoMo / ZaloPay) bằng Webhook để tự động duyệt đơn vị ngay khi người dùng chuyển khoản thành công.
*   **Full-text Search:** Tích hợp Algolia hoặc Elasticsearch để hỗ trợ tìm kiếm sân mượt mà hơn (tìm theo tên, địa chỉ viết tắt, không dấu).
*   **Bản đồ tương tác (Map View):** Hiển thị các điểm sân và kèo ghép đội trên bản đồ (Google Maps API / Mapbox).

### Giai đoạn 3: Tối ưu dài hạn (Long-term)
*   **Thuật toán AI Gợi ý:** Đề xuất kèo ghép đội và sân dựa trên hành vi, trình độ và khung giờ sinh hoạt của người chơi.
*   **Advanced Analytics:** Báo cáo doanh thu, mật độ đặt sân cho chủ sở hữu bằng biểu đồ tương tác.
*   **Ứng dụng Mobile:** Triển khai React Native / Flutter cho nền tảng iOS & Android.

---

## 3. Giải pháp kỹ thuật cốt lõi

### Thuật toán Gợi ý và Ghép nối (Weighted Matchmaking)
Để kết nối người chơi hiệu quả, hệ thống sử dụng thuật toán chấm điểm dựa trên **trọng số (weights)** đối với các thuộc tính của người dùng và trận đấu:
1.  **Khoảng cách địa lý (Distance - 40%):** Dùng công thức Haversine tính toán khoảng cách từ `user_location` đến `venue_location`. Điểm càng cao khi khoảng cách càng gần (< 5km).
2.  **Thời gian & Tính sẵn sàng (Availability - 30%):** Khớp khung giờ rảnh rỗi của người dùng với lịch của các trận đấu sắp diễn ra (hôm nay, ngày mai). Trận càng sắp diễn ra sẽ có độ ưu tiên hiển thị cao hơn.
3.  **Trình độ (Skill Level - 20%):** Đối chiếu Cấp độ (Beginner, Intermediate, Advanced) của người chơi với yêu cầu của Host.
4.  **Uy tín (Credibility - 10%):** Điểm đánh giá (Rating/Credibility) của người dùng để ưu tiên ghép với những host đáng tin cậy.

### Tự động hóa Quy trình
*   **Quản lý Slot:** Cloud Functions thực thi Transaction để tránh "Race Condition" (hai người đặt cùng lúc).
*   **Cron Jobs (Firebase Scheduler):** Chạy script định kỳ (ví dụ: mỗi phút) để tự động hủy các đơn "Hold" quá 10 phút mà chưa thanh toán để nhả slot cho người khác.
*   **Thông báo (Notifications):** Realtime listener đẩy thông báo đến UID tương ứng khi đơn được duyệt, bị hủy, hoặc kèo bị thay đổi.

---

## 4. Kế hoạch tài nguyên (Resource Plan)

Kiến trúc Serverless (Pay-as-you-go) cho phép SportSpace khởi chạy với chi phí cực thấp, chỉ trả tiền khi có người dùng.

*   **Hosting & Domain:** Firebase Hosting kết hợp CDN toàn cầu (Miễn phí giới hạn đầu). Tên miền tùy chỉnh (~$15/năm).
*   **Database (Firestore):**
    *   Tối ưu hóa: Dữ liệu công khai (danh sách sân) được Cache tại trình duyệt (`localStorage`) tối đa 5-15 phút để giảm thiểu số lượng *Document Reads*.
    *   Phân trang (Pagination) thông qua Cursor để không query thừa dữ liệu.
*   **Cloud Functions:** Ước tính chi phí thấp do chỉ gọi hàm ở các thao tác Ghi (Giao dịch, Booking) thay vì các thao tác Đọc.
*   **Kế hoạch khởi điểm (Giai đoạn đầu):** Gói Firebase Blaze (chỉ trả tiền khi vượt quá định mức miễn phí khổng lồ: 50k reads/ngày, 2M invocations/tháng). Chi phí hạ tầng trong 6 tháng đầu dự kiến < $10/tháng.

---

## 5. Bảo mật và Quyền riêng tư (Security & Privacy)

*   **Mã hóa & Xác thực:** Mọi truy cập giao tiếp qua HTTPS/SSL. Xác thực bảo vệ bằng Firebase Auth JWT Tokens.
*   **Firestore Security Rules:** Phân quyền nghiêm ngặt theo mô hình RBAC:
    *   Người dùng chỉ được đọc/ghi thông tin cá nhân (`request.auth.uid == userId`).
    *   Chủ sân (Owner) chỉ có quyền cập nhật sân/giá/bảo trì của các cơ sở có `facility_id` thuộc quyền quản lý của họ.
    *   Chống Spam: Giới hạn dung lượng và loại file hình ảnh tải lên (chỉ nhận JPG/PNG/WebP, max 5MB).
*   **Bảo vệ dữ liệu riêng tư:** Khi người dùng xóa tài khoản, hệ thống áp dụng cơ chế "Ẩn danh hóa" (Anonymization) - gỡ bỏ toàn bộ định danh cá nhân (tên, số điện thoại, email) nhưng vẫn giữ lại metadata tài chính cho mục đích kiểm toán của chủ sân.
*   **Biện pháp chống chèn ép (Rate Limiting/DDoS):** Khóa tính năng tạo đơn liên tục nếu tài khoản có dấu hiệu spam, dựa vào Security rules kiểm tra timestamp.
