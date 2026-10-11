const listeners = new Set();
export function watchMatchUpdates(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function notifyMatchUpdate() {
  for (const listener of listeners) listener();
}

export async function performMatchAction(api, feed, action, data) {
  const result = await api(action, data);
  const id = result?.id || data.matchId;
  if (id && result) feed.applyPatch(id, result);
  notifyMatchUpdate();
  void feed.refresh();
  return result;
}
