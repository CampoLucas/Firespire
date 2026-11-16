export function createReadiness(resources) {
  const pending = new Set(resources);
  const listeners = new Set();
  let error = "";
  const notify = () => listeners.forEach((listener) => listener());
  return {
    get status() { return error ? "error" : pending.size ? "loading" : "ready"; },
    get error() { return error; },
    isComplete(resource) { return !pending.has(resource); },
    complete(resource) { pending.delete(resource); notify(); },
    fail(reason) { error = reason instanceof Error ? reason.message : String(reason); notify(); },
    subscribe(listener) { listeners.add(listener); listener(); return () => listeners.delete(listener); },
  };
}

export function startCountdown(duration, update, complete) {
  const start = performance.now();
  let frame = 0;
  let active = true;
  const tick = () => {
    if (!active) return;
    update(Math.min(duration, performance.now() - start));
    frame = requestAnimationFrame(tick);
  };
  const timer = setTimeout(() => {
    if (!active) return;
    active = false;
    cancelAnimationFrame(frame);
    update(duration);
    complete();
  }, duration);
  tick();
  return () => { active = false; clearTimeout(timer); cancelAnimationFrame(frame); };
}
