import React from 'react';
import AsyncStatus from './AsyncStatus';
import './AdminPanel.css';
const VenueDataReview = React.lazy(() => import('./VenueDataReview'));

export default function AdminPanel({ lang = 'vi' }) {
  return <section className="container booking-flow admin-panel">
    <header className="admin-page-header"><div>
      <span className="admin-eyebrow">SPORTSPACE / ADMIN</span>
      <h2>{lang === 'vi' ? 'Duyệt dữ liệu sân' : 'Venue data review'}</h2>
      <p>{lang === 'vi' ? 'Điện thoại, ảnh và giá sân. Chọn từ nguồn có sẵn; chỉ tìm bổ sung khi chưa có nguồn phù hợp.' : 'Phones, images and prices. Choose existing sources; search only when no suitable source remains.'}</p>
    </div></header>
    <React.Suspense fallback={<AsyncStatus loading lang={lang} />}>
      <VenueDataReview lang={lang} focused />
    </React.Suspense>
  </section>;
}
