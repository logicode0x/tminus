import test from 'node:test';
import assert from 'node:assert/strict';
import { refreshWhileVisible } from '../web/live-refresh.mjs';

const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
  const visibility = new EventTarget();
  visibility.hidden = false;
  const callbacks = new Map();
  const timers = {
    setInterval(fn, ms) { assert.equal(ms, 30_000); callbacks.set(1, fn); return 1; },
    clearInterval(id) { callbacks.delete(id); },
  };
  return { visibility, timers, tick: () => callbacks.get(1)?.(),
    show(hidden) { visibility.hidden = hidden; visibility.dispatchEvent(new Event('visibilitychange')); },
    timerCount: () => callbacks.size };
}

test('an open launch list receives updated market caps without a page reload', async () => {
  const f = fixture(), shown = [];
  let cap = 100;
  const stop = refreshWhileVisible({ ...f, load: async () => [{ mint: 'token', marketCapUsd: cap }], onData: data => shown.push(data) });
  await flush();
  cap = 200;
  f.tick(); await flush();
  assert.deepEqual(shown.map(data => data[0].marketCapUsd), [100, 200]);
  stop();
});

test('hidden tabs pause requests and refresh immediately when visible again', async () => {
  const f = fixture(); let calls = 0;
  const stop = refreshWhileVisible({ ...f, load: async () => ++calls, onData() {} });
  await flush();
  f.show(true); f.tick(); await flush();
  assert.equal(calls, 1);
  f.show(false); await flush();
  assert.equal(calls, 2);
  stop();
});

test('a failed refresh preserves displayed data and a later refresh recovers', async () => {
  const f = fixture(), shown = [], errors = [];
  let fail = false;
  const stop = refreshWhileVisible({ ...f, load: async () => { if (fail) throw new Error('offline'); return 100; },
    onData: data => shown.push(data), onError: error => errors.push(error.message) });
  await flush(); fail = true;
  f.tick(); await flush();
  assert.deepEqual(shown, [100]); assert.deepEqual(errors, ['offline']);
  fail = false; f.tick(); await flush();
  assert.deepEqual(shown, [100, 100]);
  stop();
});

test('slow requests do not overlap, and unmount ignores late results and removes the timer and listener', async () => {
  const f = fixture(), shown = [];
  let calls = 0, resolve;
  const stop = refreshWhileVisible({ ...f, load: () => { calls++; return new Promise(done => { resolve = done; }); }, onData: data => shown.push(data) });
  f.tick(); f.show(false);
  assert.equal(calls, 1);
  stop(); resolve(200); await flush();
  f.tick(); f.show(false); await flush();
  assert.deepEqual(shown, []); assert.equal(calls, 1); assert.equal(f.timerCount(), 0);
});
