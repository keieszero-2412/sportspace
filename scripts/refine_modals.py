import sys

filepath_auth = 'd:/PYTHON/SPORTSPACE/src/components/AuthModal.jsx'
with open(filepath_auth, 'r', encoding='utf-8') as f:
    content_auth = f.read()

# Update tabs to match design system colors
content_auth = content_auth.replace(
'''borderBottom: `3px solid ${isLogin ? "#22C55E" : "transparent"}`,''',
'''borderBottom: `3px solid ${isLogin ? "var(--btn-primary)" : "transparent"}`,
                whiteSpace: "nowrap"'''
)

content_auth = content_auth.replace(
'''borderBottom: `3px solid ${!isLogin ? "#22C55E" : "transparent"}`,''',
'''borderBottom: `3px solid ${!isLogin ? "var(--btn-primary)" : "transparent"}`,
                whiteSpace: "nowrap"'''
)

with open(filepath_auth, 'w', encoding='utf-8') as f:
    f.write(content_auth)


filepath_profile = 'd:/PYTHON/SPORTSPACE/src/components/UserProfileModal.jsx'
with open(filepath_profile, 'r', encoding='utf-8') as f:
    content_profile = f.read()

content_profile = content_profile.replace(
'''              className="btn btn-outline"
              style={{
                fontSize: "0.78rem",
                padding: "6px 12px",
                color: "#DC2626",
                borderColor: "#DC2626",
              }}''',
'''              className="btn"
              style={{
                fontSize: "0.85rem",
                padding: "8px 16px",
                background: "rgba(239, 68, 68, 0.1)",
                color: "#EF4444",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                whiteSpace: "nowrap"
              }}'''
)

content_profile = content_profile.replace(
'''              className="btn"
              style={{
                fontSize: "0.78rem",
                padding: "6px 12px",
                background:
                  "linear-gradient(135deg, #F59E0B 0%, #D97706 100%)",
                color: "#FFF",
                border: "none",
              }}''',
'''              className="btn"
              style={{
                fontSize: "0.85rem",
                padding: "8px 16px",
                background: "linear-gradient(135deg, #F59E0B 0%, #D97706 100%)",
                color: "#FFF",
                border: "none",
                whiteSpace: "nowrap",
                boxShadow: "var(--shadow-sm)"
              }}'''
)

content_profile = content_profile.replace(
'''              className="btn btn-secondary"
              style={{ fontSize: "0.78rem", padding: "6px 12px" }}''',
'''              className="btn btn-secondary"
              style={{ fontSize: "0.85rem", padding: "8px 16px", whiteSpace: "nowrap" }}'''
)

content_profile = content_profile.replace(
'''            <button
              aria-label={lang === "vi" ? "Đóng hồ sơ" : "Close profile"}
              onClick={onClose}
              className="btn btn-outline"
              style={{ padding: "6px", borderRadius: "50%" }}
            >
              <X size={18} />
            </button>''',
'''            <button
              aria-label={lang === "vi" ? "Đóng hồ sơ" : "Close profile"}
              onClick={onClose}
              className="btn btn-outline"
              style={{ padding: "8px", borderRadius: "50%", border: "none", background: "transparent" }}
            >
              <X size={20} />
            </button>'''
)

with open(filepath_profile, 'w', encoding='utf-8') as f:
    f.write(content_profile)

print("AuthModal and UserProfileModal updated successfully!")
