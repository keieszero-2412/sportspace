import sys

filepath = 'd:/PYTHON/SPORTSPACE/src/components/AuthModal.jsx'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
'''  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center animate-fade-in px-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 backdrop-blur-md transition-colors"
        style={{
          backgroundColor: isDark
            ? "rgba(12, 45, 69, 0.8)"
            : "rgba(49, 70, 90, 0.6)",
        }}
        onClick={onClose}
      />

      {/* Modal Content */}
      <div
        className="relative w-full max-w-md flex flex-col animate-slide-up shadow-2xl"
        style={{
          backgroundColor: isDark ? "#1C3144" : "#FFFDF7",
          borderRadius: "24px",
          border: `1px solid ${isDark ? "rgba(137, 185, 230, 0.2)" : "rgba(255, 255, 255, 0.8)"}`,
          maxHeight: "90vh",
          overflow: "hidden",
        }}
      >''',
'''  return (
    <div className="modal-overlay" onClick={onClose}>
      {/* Modal Content */}
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "450px",
          padding: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >'''
)


content = content.replace(
'''          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full transition-colors hover:bg-black/10 z-10"
            style={{ color: isDark ? "#89B9E6" : "#5F7489" }}
          >
            <X size={20} />
          </button>''',
'''          <button
            onClick={onClose}
            className="absolute top-4 right-4 btn btn-outline"
            style={{ padding: "6px", borderRadius: "50%", zIndex: 10, border: "none", background: "transparent" }}
          >
            <X size={18} />
          </button>'''
)

content = content.replace(
'''              <button
                type="submit"
                disabled={isSubmitting || isGoogleLoading}
                className="w-full py-3.5 rounded-xl font-bold text-white shadow-lg transition-transform hover:scale-[1.02] active:scale-95 disabled:opacity-70 disabled:hover:scale-100 flex items-center justify-center gap-2 mt-2"
                style={{
                  background:
                    "linear-gradient(135deg, #22C55E 0%, #16A34A 100%)",
                }}
              >''',
'''              <button
                type="submit"
                disabled={isSubmitting || isGoogleLoading}
                className="btn btn-primary w-full mt-2 flex items-center justify-center gap-2 py-3"
                style={{ fontSize: "1rem" }}
              >'''
)

content = content.replace(
'''                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={isGoogleLoading || isSubmitting}
                  className="flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold transition-all hover:scale-105 shadow-sm disabled:opacity-70 disabled:hover:scale-100"
                  style={{
                    backgroundColor: isDark ? "rgba(12, 45, 69, 0.5)" : "#FFF",
                    border: `1px solid ${isDark ? "#3E5BA3" : "#BCE0F7"}`,
                    color: isDark ? "#FFF8D2" : "#31465A",
                  }}
                >''',
'''                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={isGoogleLoading || isSubmitting}
                  className="btn btn-secondary w-full flex items-center justify-center gap-2 py-3"
                  style={{ fontSize: "0.95rem" }}
                >'''
)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("AuthModal.jsx updated successfully!")
