const clean = (value, max = 2000) => String(value ?? '').trim().slice(0, max);
export function sourceUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error();
    return url.href;
  } catch { throw new Error('invalid-source-url'); }
}
export function venueReview(data, actor, now) {
  if (actor.role !== 'admin') throw new Error('admin-required');
  if (!['image', 'phone', 'price_summary'].includes(data.field)
    || !['approve', 'reject'].includes(data.operation)) throw new Error('invalid-venue-review');
  if (!data.facilityId || String(data.facilityId).includes('/') || !data.key) throw new Error('invalid-venue-review');
  const source = sourceUrl(data.sourceUrl);
  const evidence = clean(data.evidence);
  if (!evidence) throw new Error('source-evidence-required');
  let value = clean(data.value), metadata = {};
  if (data.field === 'image') {
    value = sourceUrl(value);
    if (data.operation === 'approve' && (data.rightsConfirmed !== true || !clean(data.license)))
      throw new Error('image-rights-required');
    metadata = { imageSourceUrl: source, imageLicense: clean(data.license, 300),
      imageRightsConfirmed: data.rightsConfirmed === true, imageVerifiedAt: now, imageVerifiedBy: actor.uid };
  } else if (data.field === 'phone') {
    value = value.replace(/[\s().-]/g, '').replace(/^\+?84/, '0');
    if (data.operation === 'approve' && (!/^(?:0[35789]\d{8}|02\d{9})$/.test(value) || value === '0598370497'
      || /^(\d)\1+$/.test(value.slice(1)) || /^(?:0123456789|0912345678|0987654321)$/.test(value)))
      throw new Error('invalid-venue-phone');
    metadata = { phone_status: 'sourced', phone_sources: [{ url: source, phone: value, evidence }],
      phone_checked_at: new Date(now).toISOString() };
  } else {
    const min = Number(data.min), max = Number(data.max);
    const basis = clean(data.basis, 40), unitMinutes = Number(data.unitMinutes) || null;
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min <= 0 || max < min || max > 100000000
      || !['court_hour', 'court_session', 'person_session', 'package', 'unknown',
        'court_unknown_duration', 'bundle_hour', 'court_match', 'half_court_hour'].includes(basis)
      || unitMinutes !== null && (!Number.isSafeInteger(unitMinutes) || unitMinutes < 1 || unitMinutes > 1440))
      throw new Error('invalid-reference-price');
    value = `${min.toLocaleString('vi-VN')}đ${min === max ? '' : ` - ${max.toLocaleString('vi-VN')}đ`}${basis === 'court_hour' && unitMinutes === 60 ? '/h' : ''}`;
    metadata = { price_reference: { min, max, basis, unitMinutes, sourceUrl: source,
      evidence, verifiedBy: actor.uid, verifiedAt: now, checkoutPrice: false } };
    if(basis === 'court_hour' && unitMinutes === 60) Object.assign(metadata.price_reference, {
      method:'source',estimated:false,scheduleAssumed:true,weekday:min,weekend:max,
      peak:Math.round(min*1.2/10000)*10000,peakComputed:true,
      peakFormula:'round(weekday * 1.2 / 10000) * 10000',
    });
  }
  if (data.operation === 'approve' && data.identityConfirmed !== true) throw new Error('venue-identity-confirmation-required');
  if (data.operation === 'reject' && !clean(data.reason)) throw new Error('rejection-reason-required');
  return { key: clean(data.key, 150), facilityId: clean(data.facilityId, 150), field: data.field,
    candidateId: clean(data.id, 64),
    operation: data.operation, expected: data.expected ?? null, value, sourceUrl: source,
    evidence, reason: clean(data.reason), metadata };
}

export async function reviewVenueData(client, data, actor, now) {
  const review = venueReview(data, actor, now);
  const { data: saved, error } = await client.rpc('review_venue_data', {
    p_actor: actor.uid, p_review: review,
  });
  if (error) throw error;
  return saved;
}
