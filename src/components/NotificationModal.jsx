import React from 'react';
import { 
  Bell, X, CheckCircle2, Clock, DollarSign, 
  Users, AlertCircle, ShieldCheck, Trash2, Check 
} from 'lucide-react';

export default function NotificationModal({
  isOpen,
  onClose,
  notifications = [],
  onMarkAsRead = () => {},
  onMarkAllAsRead = () => {},
  onClearNotifications = () => {},
  lang = 'vi'
}) {
  if (!isOpen) return null;

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        className="modal-content" 
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '520px', padding: '22px' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: '10px',
              background: 'var(--surface-card)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--btn-primary-hover)'
            }}>
              <Bell size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800 }}>
                {lang === 'vi' ? 'Thông Báo Hệ Thống' : 'System Notifications'}
              </h3>

            </div>
          </div>

          <button onClick={onClose} className="btn btn-outline" style={{ padding: '6px', borderRadius: '50%' }}>
            <X size={18} />
          </button>
        </div>

        {/* Action bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, fontSize: '0.78rem' }}>
          <span style={{ color: 'var(--text-muted)' }}>
            {lang === 'vi' ? `${unreadCount} thông báo chưa đọc` : `${unreadCount} unread notifications`}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onMarkAllAsRead}
              className="btn btn-outline"
              style={{ padding: '4px 10px', fontSize: '0.75rem' }}
            >
              <Check size={12} /> {lang === 'vi' ? 'Đọc tất cả' : 'Mark all read'}
            </button>
          </div>
        </div>

        {/* Notifications list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '420px', overflowY: 'auto' }}>
          {notifications.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--text-muted)' }}>
              <Bell size={32} color="var(--text-muted)" style={{ margin: '0 auto 8px' }} />
              <div>{lang === 'vi' ? 'Không có thông báo mới' : 'No new notifications'}</div>
            </div>
          ) : (
            notifications.map((n) => {
              let icon = <Bell size={16} color="var(--btn-primary)" />;
              if (n.type === 'reminder') icon = <Clock size={16} color="var(--accent-orange)" />;
              else if (n.type === 'deposit') icon = <CheckCircle2 size={16} color="#16A34A" />;
              else if (n.type === 'match') icon = <Users size={16} color="var(--btn-primary)" />;
              else if (n.type === 'refund') icon = <DollarSign size={16} color="#16A34A" />;

              return (
                <div
                  key={n.id}
                  onClick={() => onMarkAsRead(n.id)}
                  style={{
                    background: n.read ? 'var(--bg-primary)' : 'var(--surface-card)',
                    borderRadius: '12px',
                    padding: '12px 14px',
                    border: `1px solid ${n.read ? 'var(--surface-card-border)' : 'var(--btn-primary)'}`,
                    cursor: 'pointer',
                    transition: 'transform 0.15s ease'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-1px)'}
                  onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                >
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <div style={{ marginTop: 2, flexShrink: 0 }}>
                      {icon}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                          {n.title}
                        </strong>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{n.time}</span>
                      </div>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.45 }}>
                        {n.message}
                      </p>
                    </div>
                    {!n.read && (
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--btn-primary)', marginTop: 4, flexShrink: 0 }} />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid var(--surface-card-border)', textAlign: 'center' }}>
          <button onClick={onClose} className="btn btn-outline" style={{ width: '100%', padding: '8px', fontSize: '0.85rem' }}>
            {lang === 'vi' ? 'Đóng thông báo' : 'Close Notifications'}
          </button>
        </div>

      </div>
    </div>
  );
}
