import React from "react";
export default function AsyncStatus({
  loading,
  error,
  empty,
  retry,
  lang = "vi",
}) {
  if (!loading && !error && !empty) return null;
  const quotaExceeded = error?.code?.endsWith("resource-exhausted");
  const serviceUnavailable =
    error?.code?.startsWith("functions/") &&
    [
      "functions/not-found",
      "functions/internal",
      "functions/unavailable",
    ].includes(error.code);
  return (
    <div
      role={error ? "alert" : "status"}
      style={{ padding: 16, color: "var(--text-muted)" }}
    >
      {error
        ? quotaExceeded
          ? lang === "vi"
            ? "Tạm thời chưa tải được dữ liệu vì dịch vụ đã hết hạn mức. Vui lòng thử lại sau."
            : "Data is temporarily unavailable because the service quota was exceeded. Please try again later."
          : serviceUnavailable
            ? lang === "vi"
              ? "Dịch vụ xử lý yêu cầu hiện chưa khả dụng. Vui lòng thử lại sau."
              : "The service is currently unavailable. Please try again later."
            : lang === "vi"
              ? "Không tải được dữ liệu."
              : "Unable to load data."
        : loading
          ? lang === "vi"
            ? "Đang tải…"
            : "Loading…"
          : lang === "vi"
            ? "Chưa có dữ liệu."
            : "No data yet."}
      {error && retry && (
        <button
          className="btn btn-outline"
          onClick={retry}
          style={{ marginLeft: 12 }}
        >
          {lang === "vi" ? "Thử lại" : "Retry"}
        </button>
      )}
    </div>
  );
}
