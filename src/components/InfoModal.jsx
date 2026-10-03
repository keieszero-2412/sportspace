import React from "react";
import { X } from "lucide-react";

export default function InfoModal({
  isOpen,
  onClose,
  pageType,
  lang = "vi",
  theme = "light",
}) {
  if (!isOpen) return null;

  const isDark = theme === "dark";

  const contentMap = {
    about: {
      title: lang === "vi" ? "Giới thiệu" : "About Us",
      body:
        lang === "vi" ? (
          <>
            <p>
              <strong>SportSpace</strong> là dự án cá nhân giúp người chơi tìm
              sân thể thao, đặt lịch và tìm đội giao lưu.
            </p>
            <p>
              Sứ mệnh của chúng tôi là mang lại trải nghiệm đặt sân nhanh chóng,
              minh bạch và an toàn nhất cho người chơi thể thao trên toàn quốc.
            </p>
          </>
        ) : (
          <>
            <p>
              <strong>SportSpace</strong> is an independent project helping
              players find sports venues, book courts, and find teams to play with.
            </p>
            <p>
              Our mission is to provide the fastest, most transparent, and
              secure booking experience for sports enthusiasts nationwide.
            </p>
          </>
        ),
    },
    privacy: {
      title: lang === "vi" ? "Chính sách bảo mật" : "Privacy Policy",
      body:
        lang === "vi" ? (
          <>
            <h3>1. Thu thập thông tin</h3>
            <p>
              Chúng tôi thu thập thông tin cá nhân của bạn (Tên, Email, Số điện
              thoại) khi bạn đăng ký tài khoản hoặc sử dụng dịch vụ trên nền
              tảng.
            </p>
            <h3>2. Sử dụng thông tin</h3>
            <p>
              Thông tin của bạn được sử dụng để xác nhận đặt sân, hỗ trợ khách
              hàng và cải thiện chất lượng dịch vụ.
            </p>
            <h3>3. Bảo vệ dữ liệu</h3>
            <p>
              Chúng tôi cam kết bảo mật tuyệt đối thông tin cá nhân của người
              dùng bằng các biện pháp mã hóa tiên tiến nhất.
            </p>
          </>
        ) : (
          <>
            <h3>1. Information Collection</h3>
            <p>
              We collect your personal information (Name, Email, Phone) when you
              register or use our services.
            </p>
            <h3>2. Use of Information</h3>
            <p>
              Your data is used to confirm bookings, provide customer support,
              and improve our service quality.
            </p>
            <h3>3. Data Protection</h3>
            <p>
              We are committed to securing your personal information using
              advanced encryption measures.
            </p>
          </>
        ),
    },
    terms: {
      title: lang === "vi" ? "Điều khoản sử dụng" : "Terms of Service",
      body:
        lang === "vi" ? (
          <>
            <p>
              Bằng việc truy cập và sử dụng SportSpace, bạn đồng ý tuân thủ các
              điều khoản sau:
            </p>
            <ul>
              <li>Người dùng phải cung cấp thông tin chính xác khi đặt sân.</li>
              <li>
                Nghiêm cấm các hành vi gian lận, bùng lịch (no-show) có chủ
                đích.
              </li>
              <li>
                SportSpace có quyền khóa tài khoản nếu phát hiện vi phạm nghiêm
                trọng.
              </li>
            </ul>
          </>
        ) : (
          <>
            <p>
              By accessing and using SportSpace, you agree to the following
              terms:
            </p>
            <ul>
              <li>Users must provide accurate information when booking.</li>
              <li>
                Fraudulent activities and intentional no-shows are strictly
                prohibited.
              </li>
              <li>
                SportSpace reserves the right to suspend accounts for severe
                violations.
              </li>
            </ul>
          </>
        ),
    },
    regulations: {
      title: lang === "vi" ? "Quy chế hoạt động" : "Operating Regulations",
      body:
        lang === "vi" ? (
          <>
            <p>
              Quy chế hoạt động của dự án SportSpace:
            </p>
            <p>
              1. <strong>Nguyên tắc chung:</strong> SportSpace là dự án do cá
              nhân phát triển và vận hành.
            </p>
            <p>
              2. <strong>Quy trình giao dịch:</strong> Người mua tìm hiểu thông
              tin, đặt lịch và chuyển khoản theo hướng dẫn của chủ sân. Chủ
              sân kiểm tra biên lai và xác nhận thanh toán.
            </p>
            <p>
              3. <strong>Giải quyết tranh chấp:</strong> Mọi tranh chấp phát
              sinh sẽ được giải quyết dựa trên tinh thần thương lượng và tuân
              thủ pháp luật Việt Nam.
            </p>
          </>
        ) : (
          <>
            <p>SportSpace Project Operating Regulations:</p>
            <p>
              1. <strong>General Principles:</strong> SportSpace is developed
              and operated by an individual.
            </p>
            <p>
              2. <strong>Transaction Process:</strong> Users review information,
              book, and make a bank transfer following the venue owner's
              instructions. The owner checks the receipt and confirms payment.
            </p>
            <p>
              3. <strong>Dispute Resolution:</strong> Disputes will be resolved
              through negotiation according to local laws.
            </p>
          </>
        ),
    },
    "booking-guide": {
      title: lang === "vi" ? "Hướng dẫn đặt sân" : "Booking Guide",
      body:
        lang === "vi" ? (
          <>
            <ol>
              <li>Đăng nhập vào tài khoản SportSpace của bạn.</li>
              <li>Tìm kiếm cụm sân mong muốn qua ô tìm kiếm hoặc bộ lọc.</li>
              <li>Xem thông tin sân và bấm "Đặt sân".</li>
              <li>Chọn giờ trống, điền thông tin và thanh toán.</li>
              <li>Nhận mã QR và đến sân đúng giờ để check-in.</li>
            </ol>
          </>
        ) : (
          <>
            <ol>
              <li>Log into your SportSpace account.</li>
              <li>Search for venues using keywords or filters.</li>
              <li>View court details and click "Book".</li>
              <li>Select available time, fill details, and pay.</li>
              <li>Receive QR code and show up on time to check-in.</li>
            </ol>
          </>
        ),
    },
    "payment-guide": {
      title: lang === "vi" ? "Hướng dẫn thanh toán" : "Payment guide",
      body: (
        <>
          <p>
            {lang === "vi"
              ? "Chuyển khoản theo tài khoản, số tiền và mã đơn hiển thị khi giữ sân."
              : "Transfer to the account with the amount and reference shown in your hold."}
          </p>
          <p>
            {lang === "vi"
              ? "Gửi biên lai để chủ sân xác minh trong thời hạn giữ sân. Gửi ảnh không tự xác nhận đã thanh toán."
              : "Submit a receipt for owner verification before the hold expires. Uploading an image does not confirm payment."}
          </p>
          <p>
            {lang === "vi"
              ? "Hủy trước ít nhất 12 giờ đủ điều kiện yêu cầu hoàn tiền đã xác minh. Chủ sân thực hiện hoàn khoản chuyển và xác nhận giao dịch; chưa có ví nội bộ."
              : "Cancel at least 12 hours ahead to request a refund of verified payments. The owner transfers the refund and verifies it; there is no internal wallet."}
          </p>
        </>
      ),
    },
    faq: {
      title: lang === "vi" ? "Câu hỏi thường gặp" : "FAQ",
      body: (
        <>
          <h4>
            {lang === "vi"
              ? "Hủy sân có được hoàn tiền?"
              : "Can a cancellation be refunded?"}
          </h4>
          <p>
            {lang === "vi"
              ? "Hủy trước ít nhất 12 giờ: yêu cầu hoàn toàn bộ tiền đã được xác minh. Hủy muộn không tự phát sinh hoàn tiền."
              : "Cancel at least 12 hours ahead to request all verified funds. Late cancellation does not automatically generate a refund."}
          </p>
          <h4>
            {lang === "vi"
              ? "Làm sao trở thành chủ sân?"
              : "How do I become a venue owner?"}
          </h4>
          <p>
            {lang === "vi"
              ? "Gửi hồ sơ trong mục Tài khoản. Quản trị viên xác minh và gán cơ sở trước khi cấp quyền."
              : "Submit your application in Profile. An administrator verifies ownership and assigns the facility before granting access."}
          </p>
          <h4>
            {lang === "vi"
              ? "Điểm uy tín thay đổi thế nào?"
              : "How does credibility change?"}
          </h4>
          <p>
            {lang === "vi"
              ? "Khách xác nhận tham dự và chủ sân hoàn tất đơn thì ghi nhận sự kiện cộng tối đa 2 điểm, giới hạn 100. Không tự trừ điểm bỏ hẹn khi chưa xác minh."
              : "Customer attendance confirmation and owner completion record up to two points, capped at 100. No automatic no-show deduction without verification."}
          </p>
        </>
      ),
    },
  };

  const content = contentMap[pageType] || contentMap["about"];

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
      <div
        className="modal-content animate-slide-up"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "700px",
          padding: "30px",
          maxHeight: "85vh",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 20,
            borderBottom: "1px solid var(--surface-card-border)",
            paddingBottom: 16,
          }}
        >
          <h2
            style={{
              fontSize: "1.5rem",
              fontWeight: 800,
              color: "var(--text-primary)",
            }}
          >
            {content.title}
          </h2>
          <button
            onClick={onClose}
            className="btn btn-outline"
            style={{ padding: "6px", borderRadius: "50%" }}
          >
            <X size={20} />
          </button>
        </div>

        <div
          className="info-modal-body"
          style={{
            color: "var(--text-primary)",
            lineHeight: 1.6,
            fontSize: "0.95rem",
          }}
        >
          {content.body}
        </div>
      </div>
    </div>
  );
}
