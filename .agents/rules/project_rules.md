# QUY TẮC PHÁT TRIỂN DỰ ÁN SPORTSPACE (PROJECT RULES)

Tài liệu này định nghĩa toàn bộ tiêu chuẩn bắt buộc về Thiết kế Giao diện (UI/UX), Kỹ thuật Frontend (React/SPA), và Quản trị Mã nguồn cho toàn bộ dự án SportSpace. Mọi lập trình viên và AI Agent khi làm việc trên dự án đều phải tuân thủ nghiêm ngặt các nguyên tắc sau:

---

## 1. Nguyên tắc Trải nghiệm người dùng (UX) & Giao diện (UI)

### 1.1. Chống giật/nhảy Layout (Layout Shift Prevention)
- **Nút bấm Toggle Text**: Bất kỳ nút bấm nào thay đổi nội dung chữ khi click (ví dụ: `VI` ⇄ `EN`, `Chế độ Sáng` ⇄ `Chế độ Tối`, `Đang bật giá động` ⇄ `Đã tắt giá động`, `Trống` ⇄ `Đã đặt` ⇄ `Khóa bảo trì`, `Xin tham gia ngay` ⇄ `Đã tham gia`) **bắt buộc phải được đặt `min-width` hoặc `width` cố định**, hoặc được bọc trong thẻ có kích thước định sẵn.
- **Mục tiêu**: Tuyệt đối không để việc thay đổi độ dài chữ làm co giãn, xô lệch hoặc giật cục các phần tử xung quanh và thanh điều hướng.

### 1.2. Loại bỏ hoàn toàn Native Alerts (Zero Browser Popups)
- **Nghiêm cấm tuyệt đối**: Không được sử dụng các hàm mặc định của trình duyệt: `window.alert()`, `window.confirm()`, hay `window.prompt()`.
- **Giải pháp bắt buộc**:
  - Dùng hệ thống **Toast Notification** tùy biến (`ToastContext` / `Custom Toast`) cho các thông báo kết quả (thành công, lỗi, nhắc nhở).
  - Dùng **Custom Confirm Modal** đồng bộ phong cách thiết kế của dự án khi cần xác nhận hành động nguy hiểm hoặc hoàn tiền (hủy sân, xóa sân con, hoàn cọc).

### 1.3. An toàn với Responsive & Browser Zoom (Zoom-Proof Design)
- **Thích ứng đa kích thước**: Giao diện phải hiển thị hoàn hảo từ Mobile (320px+), Tablet (768px+), Laptop (1024px+) đến Desktop màn hình rộng (1440px+).
- **Chống vỡ khi Zoom**: Layout không được tràn viền ngang hoặc chồng chéo nội dung ở mọi mức thu phóng của trình duyệt (Browser Zoom từ 50% đến 200%).
- **Kỹ thuật áp dụng**: Sử dụng `clamp()`, `minmax()`, `flex-wrap: wrap`, đơn vị tương đối và thiết lập `overflow-x: hidden` tại root layout để ngăn thanh cuộn ngang ngoài ý muốn.

### 1.4. Nguyên tắc Scrollbar (Chống Double Scrollbar)
- **Kiểm soát vùng cuộn**: Tuyệt đối không lồng ghép nhiều thẻ chứa `overflow: auto` hoặc `overflow: scroll` vào nhau gây hiện tượng 2 thanh cuộn cạnh nhau (Double Scrollbar).
- **Sticky Elements**: Các phần tử dùng `position: sticky` (Header, Tab Bar, Bộ lọc) phải bám chuẩn vào container cuộn gốc, có `top: 0`, `z-index` phù hợp và nền mờ (Backdrop filter/Glassmorphism) để không bị hở lề hoặc nhảy vị trí khi người dùng cuộn trang.

### 1.5. Thiết kế tương tác (Micro-interactions & Living UI)
- Mọi thành phần UI tương tác (Nút bấm, Thẻ sân, Thẻ kèo, Tab, Badge, Item danh sách) phải có:
  - Trạng thái `:hover`, `:active`, `:focus-visible`.
  - Hiệu ứng chuyển động mượt mà (`transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1)`).
  - Độ nổi và chiều sâu (`box-shadow`, `transform: translateY(-2px)`).
  - Tránh tuyệt đối giao diện phẳng lỳ, tĩnh lặng (flat & dead UI).

---

## 2. Kỹ thuật Frontend & Tối ưu hiệu suất (React / SPA)

### 2.1. Tối ưu Loading (Instant Render & No Flicker)
- **Ưu tiên Render tức thì**: Nếu dữ liệu đã có trong Local Cache, mock data, hoặc Global State, phải render giao diện ngay lập tức.
- **Chống chớp đen/spinner vô nghĩa**: Tuyệt đối không hiển thị spinner toàn màn hình hoặc làm chớp đen giao diện khi người dùng chuyển tab hoặc đổi bộ lọc khi dữ liệu đã sẵn sàng.

### 2.2. An toàn chặn lỗi sập UI (React Tree Crash Prevention)
- **Kiểm tra Export trước khi dùng**: Trước khi import bất kỳ thư viện UI, Component, hoặc Icon nào (đặc biệt là `lucide-react`), phải kiểm tra chính xác tên export tồn tại.
- **Error Boundary**: Bắt buộc bọc các khu vực rủi ro cao (Canvas Three.js 3D Sandbox, Modals, Dynamic Sub-views) trong `ErrorBoundary` chuyên dụng để nếu có lỗi cục bộ xảy ra, hệ thống vẫn hiển thị fallback thông báo lịch sự mà không làm sập toàn bộ cây React (màn hình trắng).

### 2.3. Điều hướng & Xử lý File tĩnh trong SPA
- **Không dùng `<a href>` trực tiếp vào file tĩnh**: Nghiêm cấm dùng thẻ `<a href="/data.json">` hoặc `<a href="/file.pdf">` trỏ vào file tĩnh trong thư mục root vì có thể gây xung đột với React Router hoặc kích hoạt reload toàn trang làm mất state của người dùng.
- **Giải pháp**: Sử dụng `fetch API` kết hợp với Modal xem trước hoặc hàm tải file chuyên dụng qua `Blob / URL.createObjectURL`.

### 2.4. Xử lý Logic Redirect (Chống Race Condition)
- Khi truy cập route cần xác thực hoặc tải dữ liệu ngầm: Không được chuyển hướng (redirect) người dùng ngay lập tức nếu state đang ở trạng thái `isFetching` hoặc `isLoading`.
- Phải đợi tiến trình mạng/dữ liệu kết thúc dứt điểm mới đưa ra quyết định chuyển hướng (tránh tình trạng vừa đá về trang login xong lại nhảy ngược về trang chủ).

---

## 3. Quản trị Source Code & Nguyên tắc làm việc của Agent

### 3.1. Khoanh vùng ảnh hưởng (Preserve Unaffected Files)
- Khi phát triển tính năng mới hoặc sửa bug, tuyệt đối không chỉnh sửa lan man, không format lại, và không can thiệp vào logic của các file đang hoạt động bình thường nếu không liên quan đến yêu cầu.
- Mọi sự thay đổi phải có mục tiêu cô lập (Zero side-effects).

### 3.2. Kiểm soát Hồi quy (Regression Prevention)
- Khi chỉnh sửa hoặc fix một vấn đề mới, bắt buộc phải rà soát xem việc sửa đổi có làm tái phát lỗi cũ hoặc phá vỡ các tính năng cốt lõi đang hoạt động (Theme Dark/Light, Song ngữ VI/EN, Sa bàn 3D, Ma trận lịch sân) hay không.
- Luôn kiểm tra biên dịch bằng `npm run build` trước khi bàn giao.

### 3.3. Nguyên tắc quản lý Dữ liệu Giả lập (Mock Data Rules)
- **Không tự ý tạo/sửa dữ liệu giả**: Tuyệt đối không được tự ý tạo thêm dữ liệu giả (mock data) hoặc chạy script ngẫu nhiên hóa (randomize) dữ liệu khi chưa có sự cho phép rõ ràng từ người dùng.
- **Minh bạch về dữ liệu**: Nếu sử dụng dữ liệu giả lập để thiết kế giao diện, phải báo cáo trung thực đó là dữ liệu giả (ví dụ: "ảnh placeholder", "số điện thoại fake"). Tuyệt đối không được nói dối người dùng rằng đó là dữ liệu thật.
- **Bảo vệ dữ liệu thật**: Nghiêm cấm mọi hành vi vô tình hoặc cố ý ghi đè, xóa, hoặc thay thế dữ liệu thật đang có bằng dữ liệu giả lập nếu chưa có sự đồng ý của người dùng.
