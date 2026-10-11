// Public, in-memory match feed. The caller supplies the client for offline tests.
export function openMatches(rows, now = Date.now()) {
  return rows.map(row => ({ ...row, ...(row.raw_data || {}), id: row.id }))
    .filter(row => row.status === 'open' && Number(row.startAt) > now)
    .sort((a, b) => Number(a.startAt) - Number(b.startAt) || String(a.id).localeCompare(String(b.id)));
}

export function matchFeedQuery(client, now, legacy = false) {
  let query = client.from('Matches').select('*');
  if (legacy) {
    query = query.eq('raw_data->>status', 'open').gt('raw_data->startAt', now)
      .order('raw_data->startAt', { ascending: true });
  } else {
    // Include raw-only imports as well as promoted columns; do not hide legacy matches.
    query = query.or(`and(status.eq.open,startAt.gt.${now}),and(raw_data->>status.eq.open,raw_data->startAt.gt.${now})`)
      .order('startAt', { ascending: true, nullsFirst: false });
  }
  return query.order('id', { ascending: true }).limit(1000);
}

export function createMatchFeed(client, { now = Date.now, timeoutMs = 8000, ttlMs = 30000, debounceMs = 150, warn = console.warn } = {}) {
  const listeners = new Set();
  let rows, savedAt = 0, channel, pending, controller, eventTimer;
  let legacy = false, dirty = false, generation = 0, mutationVersion = 0;
  const read = () => rows === undefined ? undefined : openMatches(rows, now());
  const publish = () => {
    const value = read();
    if (value !== undefined) for (const listener of listeners) listener.onData(value);
  };
  const schedule = () => {
    clearTimeout(eventTimer);
    eventTimer = setTimeout(() => { void refresh(); }, debounceMs);
  };
  function refresh() {
    if (pending) { dirty = true; return pending; }
    const revision = generation;
    const version = mutationVersion;
    const abort = new AbortController();
    controller = abort;
    let timer;
    const load = async () => {
      let result = await matchFeedQuery(client, now(), legacy).abortSignal(abort.signal);
      if (!legacy && ['42703', 'PGRST204'].includes(result.error?.code) && /status|startAt/.test(result.error.message || '')) {
        // Explicit compatibility for older raw-only tables, not an empty-data fallback.
        warn('Matches promoted columns unavailable; using raw_data filtering.');
        legacy = true;
        result = await matchFeedQuery(client, now(), true).abortSignal(abort.signal);
      }
      if (result.error) throw result.error;
      return result.data || [];
    };
    const timeout = new Promise((_, reject) => {
      abort.signal.addEventListener('abort', () => reject(new Error(
        abort.signal.reason === 'match-feed-timeout'
          ? `Không tải được kèo sau ${Math.ceil(timeoutMs / 1000)} giây. Vui lòng thử lại. / Match loading timed out; please retry.`
          : 'Match feed stopped.'
      )), { once: true });
      timer = setTimeout(() => {
        abort.abort('match-feed-timeout');
      }, timeoutMs);
    });
    const task = Promise.race([load(), timeout]).then(data => {
      if (revision !== generation) return;
      // A read started before a confirmed mutation must not roll the UI back.
      if (version !== mutationVersion) { dirty = true; return; }
      rows = data;
      savedAt = now();
      publish();
    }).catch(error => {
      if (revision !== generation) return;
      for (const listener of listeners) listener.onError?.(error);
    }).finally(() => {
      clearTimeout(timer);
      if (pending !== task) return;
      pending = undefined;
      controller = undefined;
      if (dirty && listeners.size) { dirty = false; schedule(); }
    });
    pending = task;
    return task;
  }
  function subscribe(onData, onError, { force = false } = {}) {
    const listener = { onData, onError };
    listeners.add(listener);
    if (!channel) {
      channel = client.channel(`match-feed:${crypto.randomUUID()}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'Matches' }, schedule)
        .subscribe();
    }
    if (rows !== undefined) onData(read());
    if (force || rows === undefined || now() - savedAt >= ttlMs) {
      // A new subscriber shares an ongoing read; it is not a mutation requiring another read.
      if (!pending) void refresh();
    }
    return () => {
      listeners.delete(listener);
      if (listeners.size) return;
      generation++;
      clearTimeout(eventTimer);
      controller?.abort('match-feed-stopped');
      pending = undefined;
      controller = undefined;
      dirty = false;
      if (channel) client.removeChannel(channel);
      channel = undefined;
    };
  }
  function applyPatch(id, patch) {
    mutationVersion++;
    savedAt = 0;
    if (rows === undefined) return;
    const { raw_data: patchRaw, ...fields } = patch;
    const index = rows.findIndex(row => row.id === id);
    if (index < 0) {
      rows = [...rows, { ...patch, id }];
    } else {
      rows = rows.map(row => row.id !== id ? row : {
        ...row, ...patch, id,
        raw_data: { ...(row.raw_data || {}), ...fields, ...(patchRaw || {}), id },
      });
    }
    publish();
  }
  return { read, subscribe, refresh, applyPatch };
}
