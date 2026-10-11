import React, { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { api } from '../services/api';
import { useToast } from './ToastContext';
import AsyncStatus from './AsyncStatus';
import { fetchVenueReviewCatalog, emptyReviewCatalog } from '../services/venueReviewCatalog';
import { fetchVenueReviewCounts } from '../services/venueReviewCoverage';
import { venueReviewQueue, topVenueChoices, fetchVenueReviewRecords } from '../services/venueReviewQueue';

const blank = () => ({ value: '', sourceUrl: '', evidence: '', min: '', max: '',
  basis: 'unknown', unitMinutes: '', license: '', identityConfirmed: false,
  rightsConfirmed: false, reason: '', key: crypto.randomUUID() });
const labels = { image: ['Ảnh', 'Image'], phone: ['Điện thoại', 'Phone'], price_summary: ['Giá tham khảo', 'Reference price'] };
const selectFields = 'id,name,address,province,image,phone,phone_status,phone_sources,price_summary,price_reference:raw_data->price_reference';
// Recover only the exact same Wikimedia file, never substitute a different photo.
function originalImageUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'upload.wikimedia.org') return null;
    const match = url.pathname.match(/^\/wikipedia\/commons\/thumb\/([a-f0-9])\/([a-f0-9]{2})\/([^/]+)\/[^/]+$/i);
    return match ? `${url.origin}/wikipedia/commons/${match[1]}/${match[2]}/${match[3]}` : null;
  } catch { return null; }
}
export default function VenueDataReview({ lang = 'vi', requestedVenue = null, imageOnly = false, onBusyChange, focused = false }) {
  const tr = (vi, en) => lang === 'vi' ? vi : en;
  const { showError, showSuccess } = useToast();
  const [search, setSearch] = useState(''), [page, setPage] = useState(0);
  const [venues, setVenues] = useState([]), [total, setTotal] = useState(0);
  const [venue, setVenue] = useState(null), [field, setField] = useState('image');
  const [draft, setDraft] = useState(blank), [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const [error, setError] = useState(null), [retry, setRetry] = useState(0);
  const [reviewCounts, setReviewCounts] = useState(null), [reviewCountsError, setReviewCountsError] = useState(null);
  const [coverageFilter, setCoverageFilter] = useState('all'), [missingPage, setMissingPage] = useState(0);
  const [allReviews, setAllReviews] = useState([]), [queueFilter, setQueueFilter] = useState('ready');
  const [sources, setSources] = useState(emptyReviewCatalog);
  const [catalogError, setCatalogError] = useState(null);
  const [catalogRetry, setCatalogRetry] = useState(0);
  const [currentImage, setCurrentImage] = useState(null);
  const imageKey = JSON.stringify([venue?.id, venue?.image]);
  const imageState = currentImage?.key === imageKey ? currentImage : null;
  const imageReady = imageState?.status === 'loaded';
  const originalImage = originalImageUrl(venue?.image);
  const imageSrc = imageState?.original ? originalImage : venue?.image;
  useEffect(() => {
    const abort = new AbortController();
    setCatalogError(null);
    fetchVenueReviewCatalog(supabase, abort.signal).then(catalog => {
      if (!abort.signal.aborted) setSources(catalog);
    }).catch(failure => { if (!abort.signal.aborted) setCatalogError(failure); });
    return () => abort.abort();
  }, [catalogRetry]);
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  useEffect(() => {
    if (!requestedVenue?.id) return;
    if (busy) { setError(new Error(tr('Đang lưu; vui lòng chọn sân lại sau khi hoàn tất.', 'Saving; select the venue again after completion.'))); return; }
    const abort = new AbortController();
    setVenue(null); setField('image'); setDraft(blank()); setError(null);
    supabase.from('Facilities').select(selectFields).eq('id', requestedVenue.id).single().abortSignal(abort.signal)
      .then(({ data, error: failure }) => {
        if (abort.signal.aborted) return;
        if (failure) setError(failure); else setVenue(data);
      }).catch(failure => { if (!abort.signal.aborted) setError(failure); });
    return () => abort.abort();
  }, [requestedVenue?.id, requestedVenue?.requestId]);
  useEffect(() => {
    if (imageOnly || focused) return;
    const abort = new AbortController();
    setReviewCountsError(null);
    setReviewCounts(null);
    fetchVenueReviewCounts(supabase, abort.signal).then(counts => {
      if (!abort.signal.aborted) setReviewCounts(counts);
    }).catch(failure => { if (!abort.signal.aborted) setReviewCountsError(failure); });
    return () => abort.abort();
  }, [retry, imageOnly, focused]);
  useEffect(() => {
    if (imageOnly) { setLoading(false); return; }
    const abort = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true); setError(null);
      try {
        if (focused) {
          const rows = [];
          for (let offset = 0; ; offset += 500) {
            const result = await supabase.from('Facilities').select(selectFields).order('id').range(offset, offset + 499).abortSignal(abort.signal);
            if (result.error) throw result.error;
            rows.push(...(result.data || []));
            if (!result.data || result.data.length < 500) break;
          }
          const reviews = await fetchVenueReviewRecords(supabase, abort.signal);
          if (!abort.signal.aborted) { setVenues(rows); setTotal(rows.length); setAllReviews(reviews); }
          return;
        }
        let query = supabase.from('Facilities').select(selectFields, { count: 'exact' }).order('id');
        if (search.trim()) query = query.ilike('name', `%${search.trim().replace(/[\\%_]/g, '\\$&')}%`);
        const { data, count, error: failure } = await query.range(page * 24, page * 24 + 23).abortSignal(abort.signal);
        if (failure) throw failure;
        if (!abort.signal.aborted) { setVenues(data || []); setTotal(count || 0); }
      } catch (failure) { if (!abort.signal.aborted) setError(failure); }
      finally { if (!abort.signal.aborted) setLoading(false); }
    }, 200);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [focused ? '' : search, focused ? 0 : page, retry, imageOnly, focused]);
  useEffect(() => {
    if (!venue?.id) return;
    const abort = new AbortController();
    setHistory([]);
    Promise.all([
      supabase.from('Facilities').select(selectFields).eq('id', venue.id).single().abortSignal(abort.signal),
      supabase.from('VenueDataReviews').select('id,field,status,data,createdAt,reviewerId')
        .eq('facilityId', venue.id).order('createdAt', { ascending: false }).limit(50).abortSignal(abort.signal),
    ]).then(([current, reviews]) => {
        if (abort.signal.aborted) return;
        if (current.error) { setError(current.error); return; }
        setVenue(current.data);
        if (reviews.error) setError(reviews.error); else setHistory(reviews.data || []);
      }).catch(failure => { if (!abort.signal.aborted) setError(failure); });
    return () => abort.abort();
  }, [venue?.id, retry]);
  const changeDraft = patch => setDraft(previous => ({ ...previous, ...patch, key: crypto.randomUUID() }));
  const chooseVenue = item => { setVenue(item); setDraft(blank()); setError(null); };
  const choose = candidate => setDraft({ ...blank(), ...candidate,
    evidence: [candidate.sourceName, candidate.sourceAddress, candidate.evidence].filter(Boolean).join('\n'),
    identityConfirmed: false, rightsConfirmed: false, key: crypto.randomUUID() });
  async function save(operation, selectedDraft = draft) {
    if (busy || !venue) return;
    setBusy(true);
    try {
      const saved = await api('reviewVenueData', { ...selectedDraft, facilityId: venue.id, field, operation,
        expected: venue[field] ?? null });
      if (focused && operation === 'approve') {
        const index = filteredQueue.findIndex(item => item.id === venue.id);
        setVenue(filteredQueue[index + 1] || null);
        setPage(Math.floor(Math.max(0, index) / 24));
      } else setVenue(previous => ({ ...previous, ...saved }));
      setVenues(previous => previous.map(item => item.id === saved.id ? { ...item, ...saved } : item));
      setDraft(blank()); setRetry(value => value + 1);
      if (!focused) showSuccess(tr(operation === 'approve' ? 'Đã duyệt và áp dụng dữ liệu.' : 'Đã lưu từ chối; dữ liệu sân giữ nguyên.',
        operation === 'approve' ? 'Approved and applied.' : 'Rejected; venue data unchanged.'));
    } catch (failure) { if (!focused) showError(failure.message); setError(failure); }
    finally { setBusy(false); }
  }
  async function approveCandidate(candidate) {
    if (busy || loading || error || catalogError || !sources.generatedAt) return;
    await save('approve', { ...blank(), ...candidate,
      evidence: [candidate.sourceName, candidate.sourceAddress, candidate.evidence].filter(Boolean).join('\n'),
      identityConfirmed: true, rightsConfirmed: field === 'image',
      license: field === 'image' ? 'Admin attested venue identity and usage permission by clicking the explicitly labelled image approval button; source: ' + candidate.sourceUrl : '',
    });
  }
  async function keepCurrentImage() {
    if (field !== 'image' || !venue?.image || !imageReady) return;
    const source = sources.venues[venue.id]?.image?.find(candidate => candidate.value === venue.image);
    await approveCandidate({
      ...source, id: source?.id || `keep-current-${venue.id}`,
      value: venue.image, sourceUrl: source?.sourceUrl || venue.image,
      sourceName: venue.name, sourceAddress: venue.address,
      evidence: ['Admin reviewed the current Supabase image and confirmed no replacement is needed.', source?.evidence].filter(Boolean).join('\n'),
    });
  }
  const candidates = focused ? topVenueChoices(sources.venues[venue?.id]?.[field], allReviews.filter(row => row.facilityId === venue?.id), field) : sources.venues[venue?.id]?.[field] || [];
  const queue = focused ? venueReviewQueue(venues, sources.venues, allReviews) : [];
  const filteredQueue = queue.filter(item => {
    const status = item.reviewTasks[field].status;
    return (queueFilter === 'ready' ? status === 'review' || status === 'choose' : status === queueFilter)
      && `${item.name} ${item.address}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
  });
  const visibleVenues = focused ? filteredQueue.slice(page * 24, page * 24 + 24) : venues;
  const visibleTotal = focused ? filteredQueue.length : total;
  const venueIndex = filteredQueue.findIndex(item => item.id === venue?.id);
  const navigateVenue = offset => {
    const index = venueIndex < 0 ? 0 : venueIndex + offset;
    if (!filteredQueue[index] || busy || loading) return;
    chooseVenue(filteredQueue[index]); setPage(Math.floor(index / 24));
  };
  const preview = field === 'price_summary' && Number(draft.min) > 0 && Number(draft.max) >= Number(draft.min)
    ? `${Number(draft.min).toLocaleString('vi-VN')}đ${Number(draft.max) === Number(draft.min) ? '' : ` - ${Number(draft.max).toLocaleString('vi-VN')}đ`}${draft.basis === 'court_hour' && Number(draft.unitMinutes) === 60 ? '/h' : ''}`
    : draft.value;
  return <article id={imageOnly ? undefined : 'venue-data-review'} className="glass-panel feature-card admin-review" style={{ marginBottom: 24 }}>
    <h3>{imageOnly ? tr('Chọn ảnh để thay thế', 'Choose a replacement image') : tr('Duyệt nguồn ảnh, điện thoại và giá sân', 'Review venue images, phones and prices')}</h3>
    <p>{tr('Dữ liệu hiện tại lấy từ Supabase. Ứng viên chưa được xác minh; chỉ thay đúng trường bạn duyệt. Giá tham khảo không thay giá checkout.',
      'Current values come from Supabase. Candidates require review. Only the approved field changes; reference prices do not affect checkout.')}</p>
    {!imageOnly && !focused && <p>{Object.entries(sources.totals).map(([key, value]) => `${labels[key][lang === 'vi' ? 0 : 1]}: ${value.venues} ${tr('sân có nguồn', 'venues with sources')}`).join(' · ')}</p>}
    {!imageOnly && !focused && sources.coverage && <div style={{ margin: '16px 0', overflowX: 'auto' }}>
      <h4>{tr('Độ phủ nguồn cần duyệt', 'Source coverage for review')}</h4>
      <small>{tr('Bộ nguồn tổng hợp:', 'Source bundle compiled:')} {sources.generatedAt} · {tr('Đối chiếu danh sách Supabase:', 'Supabase identity snapshot:')} {sources.snapshotAt || '—'}</small>
      <div className="admin-stat-grid">
        <div><span>{tr('Tổng sân đối chiếu', 'Venues compared')}</span><strong>{sources.coverage.totalVenues}</strong></div>
        <div><span>{tr('Có cả 3 loại nguồn:', 'All 3 source types:')}</span><strong>{sources.coverage.complete}</strong></div>
        <div><span>{tr('Chưa có nguồn nào:', 'No source yet:')}</span><strong>{sources.coverage.missingAll}</strong></div>
      </div>
      <div className="admin-table-scroll"><table className="admin-coverage-table"><thead><tr>
        {[tr('Loại', 'Type'), tr('Sân có nguồn', 'Venues with sources'), tr('Ứng viên', 'Candidates'), tr('Sân thiếu nguồn', 'Missing sources'), tr('Trường đã duyệt', 'Approved fields'), tr('Trường từ chối', 'Rejected fields')].map(label => <th key={label}>{label}</th>)}
      </tr></thead><tbody>{Object.entries(sources.coverage.fields).map(([key, value]) => <tr key={key}>
        <td>{labels[key][lang === 'vi' ? 0 : 1]}</td><td>{value.venues}</td><td>{value.candidates}</td><td>{value.missing}</td>
        <td>{reviewCounts?.[key]?.approved ?? '—'}</td><td>{reviewCounts?.[key]?.rejected ?? '—'}</td>
      </tr>)}</tbody></table></div>
      <small>{tr('Nguồn có ứng viên không đồng nghĩa dữ liệu đã đúng. Số đã duyệt/từ chối lấy từ lịch sử Supabase, không giả định bằng 0 khi lỗi.',
        'Candidates are not verified facts. Approved/rejected counts come from Supabase history; errors do not become zero counts.')}</small>
      {reviewCountsError && <p role="alert">{tr('Chưa đọc được lịch sử duyệt; cần triển khai migration/API hoặc kiểm tra quyền.', 'Review history unavailable; deploy the migration/API or check permissions.')} ({reviewCountsError.code})</p>}
      <details className="admin-details admin-missing-sources"><summary>{tr('Danh sách thiếu nguồn', 'Missing-source list')} <span>{sources.coverage.missing.length} {tr('sân', 'venues')}</span></summary>
      <label>{tr('Lọc theo loại dữ liệu', 'Filter by data type')}<select className="input-field" value={coverageFilter} onChange={event => { setCoverageFilter(event.target.value); setMissingPage(0); }}>
        <option value="all">{tr('Mọi sân còn thiếu ít nhất một loại', 'All venues missing any type')}</option>
        {Object.entries(labels).map(([key, value]) => <option value={key} key={key}>{value[lang === 'vi' ? 0 : 1]}</option>)}
      </select></label>
      {sources.coverage.missing.filter(item => coverageFilter === 'all' || item.fields.includes(coverageFilter)).slice(missingPage * 12, missingPage * 12 + 12).map(item => <p className="admin-missing-row" key={item.id}>
        {item.name} ({item.id}) · {item.fields.map(key => labels[key][lang === 'vi' ? 0 : 1]).join(', ')}{' '}
        <a href={`https://www.google.com/search?q=${encodeURIComponent(`${item.name} ${item.address} ảnh điện thoại giá thuê`)}`} target="_blank" rel="noopener noreferrer">{tr('Tìm nguồn theo tên + địa chỉ', 'Search name + address')}</a>{' '}
        <button type="button" className="btn btn-outline" disabled={busy} onClick={() => { setSearch(item.name); setPage(0); }}>{tr('Tìm sân trong danh sách', 'Find venue in list')}</button>
      </p>)}
      <div className="flex gap-2"><button type="button" className="btn btn-outline" disabled={!missingPage} onClick={() => setMissingPage(value => value - 1)}>{tr('Trước', 'Previous')}</button>
        <span>{missingPage + 1}</span><button type="button" className="btn btn-outline" disabled={(missingPage + 1) * 12 >= sources.coverage.missing.filter(item => coverageFilter === 'all' || item.fields.includes(coverageFilter)).length} onClick={() => setMissingPage(value => value + 1)}>{tr('Tiếp', 'Next')}</button></div>
      </details>
    </div>}
    <AsyncStatus loading={loading || !sources.generatedAt && !catalogError} error={error || catalogError} lang={lang} retry={() => { setRetry(value => value + 1); if (catalogError) setCatalogRetry(value => value + 1); }} />
    {catalogError && <p role="alert">{catalogError.code}: {catalogError.message}</p>}
    {error && <p role="alert">{error.code}: {error.message}</p>}
    {imageOnly && !venue && !error && <p role="status">{tr('Đang tải sân và ảnh để chọn...', 'Loading venue and image choices...')}</p>}
    {!imageOnly && <>
    {focused && <>
      <div className="flex gap-2" role="group" aria-label={tr('Loại dữ liệu', 'Data type')}>{Object.entries(labels).map(([key, label]) => <button type="button" key={key} aria-pressed={field === key} className={field === key ? 'btn btn-primary' : 'btn btn-outline'} disabled={busy} onClick={() => { setField(key); setDraft(blank()); setPage(0); }}>{label[lang === 'vi' ? 0 : 1]}</button>)}</div>
      <div className="flex gap-2" style={{ flexWrap: 'wrap', margin: '12px 0' }}>{[
        ['ready', tr('Cần duyệt', 'Needs review')], ['choose', tr('Nhiều lựa chọn', 'Multiple choices')],
        ['research', tr('Chưa có nguồn phù hợp', 'No suitable source')], ['verified', tr('Đã duyệt', 'Approved')],
      ].map(([key, label]) => <button type="button" key={key} className={queueFilter === key ? 'btn btn-primary' : 'btn btn-outline'} aria-pressed={queueFilter === key} disabled={busy || loading || !sources.generatedAt || Boolean(catalogError)} onClick={() => { setQueueFilter(key); setPage(0); }}>{label} {!loading && !error && !catalogError && sources.generatedAt && `(${queue.filter(item => key === 'ready' ? ['review', 'choose'].includes(item.reviewTasks[field].status) : item.reviewTasks[field].status === key).length})`}</button>)}</div>
    </>}
    <input className="input-field" aria-label={tr('Tìm sân để duyệt', 'Search venues to review')} placeholder={tr('Tìm tên sân...', 'Search venue name...')}
      value={search} disabled={busy} onChange={event => { setSearch(event.target.value); setPage(0); }} />
    {focused && <nav className="flex gap-2" aria-label={tr('Chuyển sân duyệt', 'Review venue navigation')} style={{ margin: '12px 0', alignItems: 'center', flexWrap: 'wrap' }}>
      <button type="button" className="btn btn-outline" disabled={busy || loading || Boolean(error) || venueIndex <= 0} onClick={() => navigateVenue(-1)}>{tr('Trước', 'Previous')}</button>
      <span>{venueIndex < 0 ? 0 : venueIndex + 1} / {visibleTotal} {tr('sân', 'venues')}</span>
      <button type="button" className="btn btn-primary" disabled={busy || loading || Boolean(error) || !filteredQueue.length || venueIndex >= filteredQueue.length - 1} onClick={() => navigateVenue(1)}>{tr('Tiếp', 'Next')}</button>
    </nav>}
    <div className="admin-venue-grid">
      {visibleVenues.map(item => <button type="button" aria-pressed={venue?.id === item.id} className={venue?.id === item.id ? 'btn btn-primary admin-venue-option' : 'btn btn-outline admin-venue-option'}
        key={item.id} disabled={busy || loading || Boolean(error) || !sources.generatedAt} onClick={() => chooseVenue(item)}>{item.name} ({item.id}){focused && <><br /><small>{item.address}<br />{item.reviewTasks[field].choices.length} {tr('lựa chọn', 'choices')}{item.reviewTasks[field].reason === 'repeated_phone' || item.reviewTasks[field].reason === 'invalid_phone' ? tr(' · Số điện thoại đáng ngờ', ' · Suspect phone') : item.reviewTasks[field].reason === 'generic_image' ? tr(' · Ảnh minh họa', ' · Generic image') : ''}</small></>}</button>)}
    </div>
    {!focused && <div className="flex gap-2">
      <button type="button" className="btn btn-outline" disabled={page === 0 || busy || loading} onClick={() => setPage(value => value - 1)}>{tr('Trước', 'Previous')}</button>
      <span>{page + 1}/{Math.max(1, Math.ceil(visibleTotal / 24))} · {visibleTotal} {tr('sân', 'venues')}</span>
      <button type="button" className="btn btn-outline" disabled={(page + 1) * 24 >= visibleTotal || busy || loading} onClick={() => setPage(value => value + 1)}>{tr('Tiếp', 'Next')}</button>
    </div>}
    </>}
    {!imageOnly && !venue && <p className="admin-empty-state">{tr('Chọn một sân phía trên để xem dữ liệu hiện tại và nguồn cần duyệt.', 'Choose a venue above to compare its current data and sources.')}</p>}
    {venue && <div className="admin-selected-venue">
      <h4>{venue.name} · {venue.id}</h4><p>{venue.address}</p>
      {!imageOnly && !focused && <div className="flex gap-2">{Object.entries(labels).map(([key, label]) => <button type="button" key={key}
        className={field === key ? 'btn btn-primary' : 'btn btn-outline'} disabled={busy}
        onClick={() => { setField(key); setDraft(blank()); }}>{label[lang === 'vi' ? 0 : 1]}</button>)}</div>}
      <div className={field === 'image' ? 'admin-image-comparison' : ''}>
      <div className="admin-current-value"><p>{tr('Giá trị hiện tại:', 'Current value:')} <span>{venue[field] || '—'}</span></p>
      {field === 'image' && venue.image && <div>
        {imageState?.status !== 'failed' && <img key={`${imageKey}:${imageSrc}:${imageState?.attempt || 0}`} src={imageSrc} alt={tr('Ảnh hiện tại', 'Current image')} referrerPolicy="no-referrer" style={{ width: '100%', maxWidth: 620, height: 280, objectFit: 'contain' }}
          onLoad={() => setCurrentImage({ key: imageKey, status: 'loaded', original: Boolean(imageState?.original), attempt: imageState?.attempt || 0 })}
          onError={() => setCurrentImage({ key: imageKey, status: originalImage && !imageState?.original ? 'loading' : 'failed', original: Boolean(originalImage), attempt: imageState?.attempt || 0 })} />}
        {!imageReady && <p role="status">{imageState?.status === 'failed'
          ? tr('Không tải được ảnh từ nguồn hiện tại. Hãy tải lại hoặc chọn ảnh thay thế bên dưới.', 'The current image source could not load. Retry or choose a replacement below.')
          : tr('Đang tải ảnh hiện tại…', 'Loading current image…')}</p>}
        {imageState?.original && imageReady && <p><small>{tr('Đang xem ảnh gốc của cùng tệp vì thumbnail bị lỗi. URL lưu trên Supabase chưa thay đổi.', 'Showing the original of the same file because its thumbnail failed. The saved Supabase URL is unchanged.')}</small></p>}
        {imageState?.status === 'failed' && <button type="button" className="btn btn-outline" onClick={() => setCurrentImage({ key: imageKey, status: 'loading', original: false, attempt: (imageState?.attempt || 0) + 1 })}>{tr('Tải lại ảnh', 'Retry image')}</button>}
        <a href={venue.image} target="_blank" rel="noopener noreferrer">{tr('Mở ảnh hiện tại', 'Open current image')}</a>
      </div>}
      {focused && field === 'image' && venue.image && <div>
        <p><small>{tr('Giữ ảnh xác nhận ảnh đúng sân và có quyền sử dụng; ảnh hiện tại không bị thay đổi.', 'Keeping confirms the correct venue and usage permission; the current image remains unchanged.')}</small></p>
        <button type="button" className="btn btn-outline" disabled={busy || loading || Boolean(error) || Boolean(catalogError) || !sources.generatedAt || !imageReady || !/^https:\/\//i.test(venue.image)} onClick={keepCurrentImage}>{tr('Không cần thay thế ảnh', 'Keep current image')}</button>
      </div>}
      </div>
      {field === 'image' && <div className="admin-selected-image">
        <h4>{tr('Ảnh đã chọn để thay thế', 'Selected replacement image')}</h4>
        {draft.value ? <>
          <img src={draft.value} alt={tr('Xem trước ảnh đã chọn', 'Selected image preview')} referrerPolicy="no-referrer" style={{ width: '100%', maxWidth: 420, height: 240, objectFit: 'contain' }} />
          <p style={{ overflowWrap: 'anywhere' }}>{draft.value}</p>
          <p>{focused ? tr('Bấm “Duyệt lựa chọn này” tại ảnh muốn sử dụng.', 'Click Approve this choice on the image to use.') : tr('Chưa lưu. Xác nhận đúng sân và quyền sử dụng rồi bấm “Lưu ảnh đã chọn”.', 'Not saved. Confirm venue identity and image rights, then click Save selected image.')}</p>
        </> : <p>{tr('Bấm “Chọn ảnh này” ở một ảnh bên dưới, hoặc nhập URL ảnh của bạn.', 'Choose an image below or enter your own image URL.')}</p>}
      </div>}
      </div>
      {!candidates.length && <p>{focused ? tr('Chưa có nguồn phù hợp; dùng liên kết tìm bổ sung để đối chiếu.', 'No suitable source; use the search link to find supporting evidence.') : tr('Chưa có nguồn ứng viên. Bạn có thể thêm nguồn thủ công bên dưới; không tự suy đoán dữ liệu.',
        'No candidate found. Add a documented source below; do not guess values.')}</p>}
      {focused && queue.find(item => item.id === venue.id)?.reviewTasks[field].status === 'research' && <a href={`https://www.google.com/search?q=${encodeURIComponent(`${venue.name} ${venue.address} ${labels[field][0]}`)}`} target="_blank" rel="noopener noreferrer">{tr('Tìm bổ sung theo tên và địa chỉ sân', 'Search venue name and address')}</a>}
      <h4 className="admin-subheading">{tr('Nguồn để lựa chọn', 'Sources to choose from')} <span>{candidates.length}</span></h4>
      <div className={field === 'image' ? 'admin-candidate-grid' : 'admin-candidate-list'}>{candidates.map(candidate => <div key={candidate.id} className={`admin-source-card${draft.id === candidate.id ? ' is-selected' : ''}`}>
        {field === 'image' && <img className="admin-candidate-image" src={candidate.value} alt={tr('Ảnh ứng viên chưa duyệt', 'Unapproved image candidate')} loading="lazy" referrerPolicy="no-referrer" />}
        {field !== 'image' && <strong className="admin-candidate-value">{candidate.value || (field === 'price_summary' && Number.isSafeInteger(candidate.min) && Number.isSafeInteger(candidate.max) ? `${candidate.min.toLocaleString('vi-VN')}đ - ${candidate.max.toLocaleString('vi-VN')}đ${candidate.basis === 'court_hour' && candidate.unitMinutes === 60 ? '/h' : ''}` : '')}</strong>}
        <a href={candidate.sourceUrl} target="_blank" rel="noopener noreferrer">{tr('Mở trang nguồn', 'Open source')}</a>
        <details className="admin-source-details"><summary>{tr('Thông tin đối chiếu', 'Matching details')}</summary>
        {field === 'image' && <p style={{ overflowWrap: 'anywhere' }}>{candidate.value}</p>}
        <p>{candidate.sourceName} {candidate.sourceAddress}</p><p>{candidate.evidence}</p>
        {candidate.sources?.length > 1 && candidate.sources.slice(1).map(source => <p key={source.sourceUrl}><a href={source.sourceUrl} target="_blank" rel="noopener noreferrer">{tr('Nguồn đối chiếu bổ sung', 'Additional supporting source')}</a></p>)}
        <small>{candidate.matchStatus} · {candidate.checkedAt || tr('Nguồn lưu trước đây', 'Earlier research')} {candidate.basis && `· ${candidate.basis} · ${candidate.unitMinutes || '?'} ${tr('phút', 'minutes')}`}</small>
        </details>
        <button type="button" aria-pressed={draft.id === candidate.id} className={draft.id === candidate.id ? 'btn btn-primary' : 'btn btn-outline'} disabled={busy} onClick={() => choose(candidate)}>{draft.id === candidate.id ? tr('Đã chọn', 'Selected') : field === 'image' ? tr('Chọn ảnh này', 'Choose this image') : tr('Chọn ứng viên này', 'Select this candidate')}</button>
        {focused && <button type="button" className="btn btn-primary" disabled={busy || loading || Boolean(error) || Boolean(catalogError) || !sources.generatedAt} onClick={() => approveCandidate(candidate)}>{field === 'image' ? tr('Duyệt ảnh (đúng sân, có quyền sử dụng)', 'Approve image (correct venue, usage permitted)') : tr('Duyệt lựa chọn này (đúng sân)', 'Approve this choice (correct venue)')}</button>}
      </div>)}</div>
      {!focused && <div className="admin-review-form">
        <h4>{tr('Xác nhận và lưu', 'Confirm and save')}</h4>
        <label>{tr('Giá trị chọn / nhập thủ công', 'Selected / manual value')}<input className="input-field" value={preview} disabled={busy || field === 'price_summary'} onChange={event => changeDraft({ value: event.target.value })} /></label>
        {field === 'price_summary' && <>
          <label>{tr('Giá thấp nhất (VND)', 'Minimum price (VND)')}<input type="number" min="1" className="input-field" value={draft.min} disabled={busy} onChange={event => changeDraft({ min: event.target.value })} /></label>
          <label>{tr('Giá cao nhất (VND)', 'Maximum price (VND)')}<input type="number" min="1" className="input-field" value={draft.max} disabled={busy} onChange={event => changeDraft({ max: event.target.value })} /></label>
          <label>{tr('Đơn vị giá', 'Price basis')}<select className="input-field" value={draft.basis} disabled={busy} onChange={event => changeDraft({ basis: event.target.value })}>
            <option value="unknown">{tr('Chưa rõ đơn vị', 'Unknown basis')}</option><option value="court_hour">{tr('Thuê một sân theo giờ', 'Court hour')}</option>
            <option value="court_session">{tr('Một sân / buổi', 'Court session')}</option><option value="person_session">{tr('Một người / buổi', 'Person session')}</option><option value="package">{tr('Gói', 'Package')}</option>
            <option value="court_unknown_duration">{tr('Một sân / chưa rõ thời lượng', 'Court, unknown duration')}</option>
            <option value="bundle_hour">{tr('Gói dịch vụ / giờ', 'Bundle hour')}</option>
            <option value="court_match">{tr('Một sân / trận', 'Court match')}</option>
            <option value="half_court_hour">{tr('Nửa sân / giờ', 'Half-court hour')}</option>
          </select></label>
          <label>{tr('Thời lượng (phút, nếu nguồn ghi rõ)', 'Duration (minutes, if documented)')}<input className="input-field" type="number" min="1" max="1440" value={draft.unitMinutes ?? ''} disabled={busy} onChange={event => changeDraft({ unitMinutes: event.target.value })} /></label>
        </>}
        <label>{tr('URL trang nguồn (HTTPS)', 'Source page URL (HTTPS)')}<input type="url" className="input-field" value={draft.sourceUrl} disabled={busy} onChange={event => changeDraft({ sourceUrl: event.target.value })} /></label>
        <label>{tr('Bằng chứng đối chiếu', 'Matching evidence')}<textarea className="input-field" value={draft.evidence} disabled={busy} onChange={event => changeDraft({ evidence: event.target.value })} /></label>
        <label><input type="checkbox" checked={draft.identityConfirmed} disabled={busy} onChange={event => changeDraft({ identityConfirmed: event.target.checked })} /> {tr('Đã đối chiếu đúng tên và địa chỉ sân', 'I confirmed the venue name and address')}</label>
        {field === 'image' && <>
          <label><input type="checkbox" checked={draft.rightsConfirmed} disabled={busy} onChange={event => changeDraft({ rightsConfirmed: event.target.checked })} /> {tr('Có quyền sử dụng ảnh (chủ sân cấp phép / giấy phép phù hợp)', 'Image usage rights confirmed (owner permission / suitable license)')}</label>
          <label>{tr('Bằng chứng cấp quyền / giấy phép', 'Permission / license evidence')}<input className="input-field" value={draft.license} disabled={busy} onChange={event => changeDraft({ license: event.target.value })} /></label>
        </>}
        <label>{tr('Lý do từ chối / ghi chú', 'Rejection reason / notes')}<input className="input-field" value={draft.reason} disabled={busy} onChange={event => changeDraft({ reason: event.target.value })} /></label>
        <div className="admin-review-actions"><button type="button" className="btn btn-primary" disabled={busy || Boolean(error) || loading || !draft.identityConfirmed || !draft.sourceUrl || !draft.evidence
          || field === 'image' && (!draft.value || !draft.rightsConfirmed || !draft.license)} onClick={() => save('approve')}>{field === 'image' ? tr('Lưu ảnh đã chọn', 'Save selected image') : tr('Duyệt và áp dụng trường này', 'Approve and apply this field')}</button>
          <button type="button" className="btn btn-outline" disabled={busy || Boolean(error) || loading || !draft.reason || !draft.sourceUrl || !draft.evidence} onClick={() => save('reject')}>{tr('Từ chối ứng viên', 'Reject candidate')}</button></div>
      </div>}
      <h4 style={{ marginTop: 20 }}>{tr('Lịch sử duyệt (50 mục gần nhất)', 'Review history (latest 50)')}</h4>
      {history.map(item => <p key={item.id}>{new Date(item.createdAt).toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US')} · {labels[item.field]?.[lang === 'vi' ? 0 : 1]} · {item.status} · {item.data.value} · {item.data.reason}
        {' '}<a href={item.data.sourceUrl} target="_blank" rel="noopener noreferrer">{tr('Nguồn', 'Source')}</a></p>)}
    </div>}
  </article>;
}
