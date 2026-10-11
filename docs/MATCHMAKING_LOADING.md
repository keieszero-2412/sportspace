# Tối ưu tải matchmaking

- Trang chủ (10 kèo xem trước) và matchmaking dùng cùng `publicMatchFeed`: một
  request đang chạy và một kênh realtime, cache trong bộ nhớ 30 giây. Dữ liệu được
  làm mới ở nền khi cache hết hạn, không lưu danh sách thành viên vào localStorage.
- Lọc kèo mở, sắp bắt đầu tại server; hỗ trợ cả cột đã promote và dữ liệu import
  `raw_data`. Chỉ chuyển sang truy vấn JSON khi server báo rõ thiếu cột promote;
  lỗi quyền/schema khác được hiển thị, không coi là danh sách trống.
- Giữ giới hạn dữ liệu 1.000 bản ghi như trước, không giảm còn 24 bản ghi. Chỉ phần
  dựng thẻ có phân trang 24 kèo: bộ lọc, số lượng kèo, modal và yêu cầu tham gia từ
  trang chủ vẫn dùng toàn bộ dữ liệu đã tải.
- Timeout 8 giây, hủy request khi hết người theo dõi, bỏ response cũ. Các đợt
  realtime liên tiếp được gộp trong 150 ms; sau tạo/sửa/join/leave/cancel, UI chủ
  động làm mới và không phụ thuộc hoàn toàn vào realtime.
- `api.js`, booking, profile history và schema/RLS/backend không đổi trong lần
  tối ưu này. Các thay đổi giao diện có sẵn của người dùng được bảo toàn.

Truy vấn JSON dựa trên [PostgREST JSON columns và filtering](https://docs.postgrest.org/en/stable/references/api/tables_views.html).

Kiểm thử offline: `node --test test/match-feed.test.mjs test/matchmaking-render.test.mjs test/profile-data.test.mjs test/booking-hold.test.mjs test/booking-selection.test.mjs test/booking-transfer.test.mjs test/google-rating.test.mjs`.
Build: `npm.cmd run build`.

Không đọc/ghi Firebase, không chạy seed hay migration, không deploy production.
Chưa đo thời gian tải trên mạng/production thật; test xác minh số request/kênh
được dùng chung và số thẻ render, không khẳng định một thời gian tải thực tế.
# Interaction updates

Successful create/edit/join/leave/cancel actions publish the API's confirmed row
or patch to the shared feed immediately, then revalidate. Failed actions do not
publish changes. Reads started before a confirmed mutation cannot roll it back.
Open profile match subscriptions also refresh on local actions, without depending
on realtime delivery. Other users' changes continue through the shared realtime
subscription (requires the Matches realtime publication to be deployed).
Full matches remain visible to their host and joined members, but are excluded
from unrelated users' discovery. Cancellation closes the initiating detail modal.
No booking APIs, backend permissions, capacity validation or database schema
changes are made for this interaction update.

