# Quy tắc làm việc với Firebase

## Bắt buộc xin phép trước mọi thao tác dữ liệu

- Agent không được tự ý đọc (`read`), ghi/tạo/cập nhật (`write`) hoặc xóa (`delete`) bất kỳ dữ liệu nào trên Firebase khi chưa có sự cho phép rõ ràng của người dùng cho thao tác cụ thể đó.
- Quy tắc áp dụng cho Firestore, Realtime Database, Authentication, Storage, Cloud Functions và mọi dịch vụ Firebase có thể chứa hoặc làm thay đổi dữ liệu.
- Yêu cầu sửa mã nguồn, kiểm tra lỗi, chạy ứng dụng hoặc quyền đã cấp cho một thao tác Firebase trước đó không cho phép các thao tác Firebase khác hay các lần thao tác tiếp theo.
- Trước khi xin phép, Agent phải nêu rõ thao tác, project, collection hoặc tài nguyên, phạm vi dữ liệu và mục đích. Agent chỉ được thực hiện đúng phạm vi đã được cho phép.
- Khi có snapshot, cache, emulator, export hoặc dữ liệu cục bộ phù hợp, Agent phải dùng chúng để chẩn đoán và kiểm thử trước nhằm tránh quota và thay đổi dữ liệu thật.
- Sau một lần ghi hoặc xóa đã được cho phép, Agent không được tự đọc lại Firebase để xác minh nếu lần đọc đó chưa được người dùng cho phép riêng.
