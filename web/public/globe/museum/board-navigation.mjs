import { clamp } from "./motion.mjs";

export function panPose(pose, dx, dy) {
  const c = Math.cos(pose.roll), s = Math.sin(pose.roll);
  return { ...pose, x: pose.x - (c * dx - s * dy) / pose.scale, y: pose.y - (s * dx + c * dy) / pose.scale };
}

export function zoomPose(pose, factor, x, y) {
  const scale = pose.scale * factor;
  const c = Math.cos(pose.roll), s = Math.sin(pose.roll);
  const delta = 1 / pose.scale - 1 / scale;
  return { ...pose, scale, x: pose.x + (c * x - s * y) * delta, y: pose.y + (s * x + c * y) * delta };
}

export function constrainPose(pose, width, height, fit) {
  const valid = (n, fallback) => Number.isFinite(n) ? n : fallback;
  return {
    x: clamp(valid(pose.x, width / 2), 0, width),
    y: clamp(valid(pose.y, height / 2), 0, height),
    scale: clamp(valid(pose.scale, fit), Math.max(.02, fit * .55), 3),
    roll: valid(pose.roll, 0),
  };
}
