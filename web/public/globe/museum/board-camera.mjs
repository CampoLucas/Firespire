import { BOARD } from "./catalog.mjs";
import { clamp, mix } from "./motion.mjs";

export function overviewPose(width, height) {
  return {
    x: BOARD.width / 2, y: BOARD.height / 2,
    scale: Math.max(.01, Math.min((width - 28) / BOARD.width, (height - 20) / BOARD.height)), roll: 0,
  };
}

export function focusPose(placement, width, height) {
  return {
    x: placement.x, y: placement.y, roll: placement.rotation * Math.PI / 180,
    scale: Math.max(.01, Math.min((width - 46) / placement.width, (height - 32) / placement.height, 1.65)),
  };
}

export function interpolatePose(from, to, t, retreat = 0) {
  return {
    x: mix(from.x, to.x, t), y: mix(from.y, to.y, t),
    roll: mix(from.roll, to.roll, t),
    scale: Math.exp(mix(Math.log(from.scale), Math.log(to.scale), t)
      - retreat * Math.sin(Math.PI * t) ** 2),
  };
}

export function travelSpec(from, destination, overviewScale) {
  const distance = Math.hypot(from.x - destination.x, from.y - destination.y);
  const canRetreat = Math.min(from.scale, destination.scale) > overviewScale * 1.2;
  return {
    duration: clamp(520 + distance * .39, 550, 1050),
    retreat: canRetreat ? Math.min(.82, distance / 1300) : 0,
  };
}

export function cameraMatrix({ x, y, scale, roll }, width, height) {
  const a = Math.cos(roll) * scale;
  const b = -Math.sin(roll) * scale;
  return [a, b, -b, a, width / 2 - a * x + b * y, height / 2 - b * x - a * y];
}
