export function publicPriceReference(value) {
  if(!value||value.checkoutPrice!==false||value.basis!=='court_hour'||value.unitMinutes!==60
    ||!Number.isSafeInteger(value.min)||!Number.isSafeInteger(value.max)||value.min<=0||value.max<value.min
    ||!Number.isSafeInteger(value.peak)||value.peak!==Math.round(value.min*1.2/10000)*10000
    ||!['source','estimated'].includes(value.method))return undefined;
  return {min:value.min,max:value.max,peak:value.peak,method:value.method,scheduleAssumed:value.scheduleAssumed===true,basis:'court_hour',unitMinutes:60,checkoutPrice:false};
}
export function venuePriceLabel(venue,lang='vi') {
  const price=publicPriceReference(venue.price_reference);
  if(!price)return venue.price_summary||'';
  const money=value=>`${value.toLocaleString('vi-VN')}đ`;
  return lang==='en'?`Weekdays ${money(price.min)}, weekends ${money(price.max)}, peak ${money(price.peak)}/h`:
    `Ngày thường ${money(price.min)}, cuối tuần ${money(price.max)}, cao điểm ${money(price.peak)}/h`;
}
