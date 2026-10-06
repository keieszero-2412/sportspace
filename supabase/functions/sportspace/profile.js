const clean = (value, max = 100) => String(value ?? '').trim().slice(0, max);

// Only authenticated identity and server-controlled fields determine ownership/role.
export function profilePatch(data) {
  const patch = {};
  for (const key of ['name', 'phone', 'province', 'skillLevel', 'preferredLanguage']) {
    if (data[key] != null) patch[key] = clean(data[key]);
  }
  if (Array.isArray(data.favoriteSports))
    patch.favoriteSports = data.favoriteSports.slice(0, 10).map(value => clean(value, 50));
  return patch;
}

export async function saveProfile(client, user, data, now = Date.now()) {
  const uid = user.id;
  const get = async () => {
    const { data: row, error } = await client.from('Users').select('*').eq('id', uid).maybeSingle();
    if (error) throw error;
    return row ? { ...(row.raw_data || {}), ...row, id: uid, uid } : null;
  };
  const prior = await get();
  if (prior?.deletionRequested) throw new Error('account-deleting');
  const priorScore = Number(prior?.credibilityScore);
  const credibilityScore = Number.isFinite(priorScore)
    ? Math.max(0, Math.min(100, priorScore))
    : 100;
  if (prior && data.initializeOnly)
    return { ...prior, credibilityScore };
  const merged = {
    ...(prior || {
      role: 'user',
      credibilityScore: 100,
      name: user.user_metadata?.name || user.user_metadata?.full_name || user.email?.split('@')[0] || '',
      phone: user.user_metadata?.phone || '',
      favoriteSports: [],
      savedVenueIds: [],
      createdAt: new Date(now).toISOString(),
    }),
    ...profilePatch(data),
    credibilityScore,
    id: uid,
    uid,
    email: user.email || '',
    updatedAt: new Date(now).toISOString(),
  };
  delete merged.raw_data;
  const row = {
    id: uid, name: merged.name, email: merged.email, phone: merged.phone || null,
    role: merged.role, credibilityScore: merged.credibilityScore,
    createdAt: merged.createdAt, raw_data: merged,
  };
  const { error } = await client.from('Users').upsert(row, {
    onConflict: 'id', ignoreDuplicates: Boolean(data.initializeOnly),
  });
  if (error) throw error;
  // Another tab may have inserted the profile first. Return the persisted record.
  return data.initializeOnly ? await get() : merged;
}
