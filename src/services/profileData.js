const tables = { bookings: 'Bookings', matches: 'Matches', credibility: 'CredibilityEvents' };
const quoted = value => `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

export function profileQuery(client, section, uid, { limit = 100, before } = {}) {
  if (!tables[section] || !uid) throw new Error('Invalid profile query');
  let query = client.from(tables[section]).select('*');
  if (section === 'matches') {
    // Imported Matches stores all fields inside raw_data (no joinedUsers column).
    query = query.contains('raw_data', { joinedUsers: [uid] })
      .order('raw_data->createdAt', { ascending: false });
  } else {
    query = query.eq('userId', uid).order('createdAt', { ascending: false });
  }
  query = query.order('id', { ascending: false });
  if (before) {
    if (section !== 'bookings' || !before.id || !before.createdAt) throw new Error('Invalid booking cursor');
    const date = quoted(before.createdAt), id = quoted(before.id);
    query = query.or(`createdAt.lt.${date},and(createdAt.eq.${date},id.lt.${id})`);
  }
  return query.limit(limit);
}

export async function fetchProfileRecords(client, section, uid, options) {
  const { data, error } = await profileQuery(client, section, uid, options);
  if (error) throw error;
  return (data || []).map(row => ({ ...(row.raw_data || {}), ...row }));
}

export function watchProfileRecords(client, section, uid, onData, onError, options) {
  let stopped = false;
  let revision = 0;
  const refresh = async () => {
    const current = ++revision;
    try {
      const rows = await fetchProfileRecords(client, section, uid, options);
      if (!stopped && current === revision) onData(rows);
    } catch (error) {
      if (!stopped && current === revision) onError(error);
    }
  };
  const channel = client.channel(`profile:${section}:${uid}:${crypto.randomUUID()}`)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: tables[section],
      ...(section === 'matches' ? {} : { filter: `userId=eq.${uid}` }),
    }, refresh).subscribe();
  void refresh();
  return () => { stopped = true; client.removeChannel(channel); };
}
