import React, { Component } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('SportSpace ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          style={{
            padding: '32px 20px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: this.props.minHeight || '240px',
            background: 'var(--surface-card)',
            borderRadius: '16px',
            border: '1px solid var(--surface-card-border)',
            margin: '16px auto',
            maxWidth: '680px'
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16
            }}
          >
            <AlertTriangle size={28} color="#DC2626" />
          </div>

          <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>
            {this.props.title || 'Đã xảy ra sự cố hiển thị (Component Error)'}
          </h3>

          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: '480px', lineHeight: 1.5, marginBottom: 20 }}>
            {this.state.error && this.state.error.message ? this.state.error.message : (this.props.message || 'Khu vực này gặp lỗi tạm thời trong quá trình xử lý. Bạn có thể thử tải lại mà không ảnh hưởng tới toàn bộ ứng dụng.')}
          </p>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              onClick={this.handleReset}
              className="btn btn-primary"
              style={{ padding: '8px 18px', fontSize: '0.85rem' }}
            >
              <RefreshCw size={15} />
              <span>Thử tải lại khu vực này</span>
            </button>

            {this.props.showHomeBtn && (
              <button
                onClick={() => window.location.reload()}
                className="btn btn-outline"
                style={{ padding: '8px 18px', fontSize: '0.85rem' }}
              >
                <Home size={15} />
                <span>Làm mới toàn trang</span>
              </button>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
