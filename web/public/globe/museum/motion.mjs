export const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
export const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
export const mix = (a, b, t) => a + (b - a) * t;
export const ease = (t) => t * t * (3 - 2 * t);

export function tween(duration, sample, done = () => {}) {
  const start = performance.now();
  let frame = 0;
  const tick = (now) => {
    const t = duration ? clamp((now - start) / duration, 0, 1) : 1;
    sample(ease(t));
    if (t < 1) frame = requestAnimationFrame(tick);
    else done();
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}
