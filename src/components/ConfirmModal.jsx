import React, { useEffect } from "react";
import { AlertTriangle, AlertCircle, ShieldAlert, X } from "lucide-react";

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = "Xác nhận",
  cancelText = "Hủy bỏ",
  type = "warning", // 'danger' | 'warning' | 'primary'
  onConfirm = () => {},
  onClose = () => {},
  children,
}) {
  const [busy, setBusy] = React.useState(false);
  const confirming = React.useRef(false);
  const confirm = async () => {
    if (confirming.current) return;
    confirming.current = true;
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      confirming.current = false;
      setBusy(false);
    }
  };
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen && !confirming.current) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  let icon = <AlertTriangle size={24} color="#D97706" />;
  let confirmBtnClass = "btn btn-primary";
  let confirmBtnStyle = { flex: 1, padding: "10px 16px", fontSize: "0.85rem" };

  if (type === "danger") {
    icon = <AlertCircle size={24} color="#DC2626" />;
    confirmBtnStyle = {
      ...confirmBtnStyle,
      backgroundColor: "#DC2626",
      borderColor: "#DC2626",
      color: "#FFFFFF",
    };
  }

  return (
    <div
      className="modal-overlay"
      onClick={() => !confirming.current && onClose()}
      style={{ zIndex: 9999 }}
    >
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "460px",
          padding: "24px",
          borderRadius: "16px",
          boxShadow: "var(--shadow-elevation)",
          animation: "scaleUp 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "14px",
            marginBottom: "14px",
          }}
        >
          <div
            style={{
              padding: "10px",
              borderRadius: "12px",
              background:
                type === "danger"
                  ? "rgba(239, 68, 68, 0.15)"
                  : "rgba(217, 119, 6, 0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {icon}
          </div>

          <div style={{ flex: 1 }}>
            <h3
              style={{
                fontSize: "1.15rem",
                fontWeight: 800,
                color: "var(--text-primary)",
                marginBottom: "6px",
              }}
            >
              {title}
            </h3>
            <p
              style={{
                fontSize: "0.86rem",
                color: "var(--text-muted)",
                lineHeight: 1.5,
              }}
            >
              {message}
            </p>
          </div>

          <button
            disabled={busy}
            onClick={onClose}
            className="btn btn-outline"
            style={{ padding: "6px", borderRadius: "50%", flexShrink: 0 }}
            title="Đóng"
          >
            <X size={16} />
          </button>
        </div>

        {children}
        <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
          <button
            disabled={busy}
            onClick={onClose}
            className="btn btn-outline"
            style={{ flex: 1, padding: "10px 16px", fontSize: "0.85rem" }}
          >
            {cancelText}
          </button>
          <button
            disabled={busy}
            onClick={confirm}
            className={confirmBtnClass}
            style={confirmBtnStyle}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
