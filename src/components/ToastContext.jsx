import React, { createContext, useContext, useState, useCallback } from "react";
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  X,
} from "lucide-react";

const ToastContext = createContext({
  showToast: () => {},
  showSuccess: () => {},
  showError: () => {},
  showWarning: () => {},
  showInfo: () => {},
});

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message, type = "info", duration = 3500) => {
      const id = Date.now() + Math.random().toString(36).substr(2, 9);
      const displayMessage =
        typeof message === "string"
          ? message
          : message?.message || String(message);
      setToasts((prev) => [
        ...prev,
        { id, message: displayMessage, type, duration },
      ]);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast],
  );

  const showSuccess = useCallback(
    (msg, duration) => showToast(msg, "success", duration),
    [showToast],
  );
  const showError = useCallback(
    (msg, duration) => showToast(msg, "error", duration),
    [showToast],
  );
  const showWarning = useCallback(
    (msg, duration) => showToast(msg, "warning", duration),
    [showToast],
  );
  const showInfo = useCallback(
    (msg, duration) => showToast(msg, "info", duration),
    [showToast],
  );

  return (
    <ToastContext.Provider
      value={{ showToast, showSuccess, showError, showWarning, showInfo }}
    >
      {children}

      {/* Toast Container - Fixed Position, No Layout Shift, Zoom-Proof */}
      <div
        style={{
          position: "fixed",
          bottom: "24px",
          right: "24px",
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          maxWidth: "min(420px, calc(100vw - 32px))",
          pointerEvents: "none",
        }}
      >
        {toasts.map((t) => {
          let icon = <Info size={18} color="var(--btn-primary-hover)" />;
          let borderColor = "var(--btn-primary)";
          let bgColor = "var(--surface-card)";

          if (t.type === "success") {
            icon = <CheckCircle2 size={18} color="#16A34A" />;
            borderColor = "#16A34A";
          } else if (t.type === "error") {
            icon = <AlertCircle size={18} color="#DC2626" />;
            borderColor = "#DC2626";
          } else if (t.type === "warning") {
            icon = <AlertTriangle size={18} color="#D97706" />;
            borderColor = "#D97706";
          }

          return (
            <div
              key={t.id}
              className="glass-panel"
              style={{
                pointerEvents: "auto",
                display: "flex",
                alignItems: "flex-start",
                gap: "12px",
                padding: "14px 16px",
                borderRadius: "12px",
                borderLeft: `5px solid ${borderColor}`,
                background: bgColor,
                boxShadow: "var(--shadow-elevation)",
                color: "var(--text-primary)",
                fontSize: "0.85rem",
                lineHeight: 1.45,
                animation: "slideInRight 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
              }}
            >
              <div style={{ flexShrink: 0, marginTop: "1px" }}>{icon}</div>
              <div
                style={{ flex: 1, wordBreak: "break-word", fontWeight: 600 }}
              >
                {t.message}
              </div>
              <button
                onClick={() => removeToast(t.id)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  padding: "2px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "4px",
                  flexShrink: 0,
                }}
                title="Đóng"
              >
                <X size={15} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export default ToastContext;
