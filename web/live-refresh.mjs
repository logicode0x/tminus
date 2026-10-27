// Launch-card market data is cached by the server for 30 seconds. Keep open lists current without overlapping requests or polling
// hidden tabs. A failed refresh leaves the caller's last successful data in place; cleanup ignores requests still in flight.
export function refreshWhileVisible({ load, onData, onError = () => {}, intervalMs = 30_000, visibility = document, timers = globalThis }) {
  let active = true, pending = false;
  const refresh = async () => {
    if (!active || pending || visibility.hidden) return;
    pending = true;
    try {
      const data = await load();
      if (active) onData(data);
    } catch (error) {
      if (active) onError(error);
    } finally {
      pending = false;
    }
  };
  visibility.addEventListener('visibilitychange', refresh);
  const timer = timers.setInterval(refresh, intervalMs);
  refresh();
  return () => {
    active = false;
    timers.clearInterval(timer);
    visibility.removeEventListener('visibilitychange', refresh);
  };
}
