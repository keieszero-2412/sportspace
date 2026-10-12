export function bookingRates(reference) {
  if (!reference || reference.basis !== 'court_hour' || reference.unitMinutes !== 60
    || !Number.isSafeInteger(reference.min) || reference.min <= 0
    || !Number.isSafeInteger(reference.max) || reference.max < reference.min
    || !Number.isSafeInteger(reference.peak)
    || reference.peak !== Math.round(reference.min * 1.2 / 10000) * 10000
    || reference.peak <= 0) return null;
  return { basePrice: reference.min, price_day: reference.min,
    price_night: reference.peak, price_weekend: reference.max };
}
