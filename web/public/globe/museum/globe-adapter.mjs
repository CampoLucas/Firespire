import { clamp, mix, reducedMotion, tween } from "./motion.mjs";

const controlKeys = [
  "enabled", "enableDamping", "enableZoom", "enableRotate", "enablePan",
  "autoRotate", "autoRotateSpeed", "zoomSpeed", "rotateSpeed",
];

export function createGlobeAdapter(globe, ctl, THREE, canvasHost) {
  const camera = globe.camera();
  const surfaceRadius = globe.getGlobeRadius();
  let releaseFlight = () => {};
  let leased = false;

  function capture() {
    return Object.freeze({
      position: Object.freeze(camera.position.toArray()),
      orientation: Object.freeze(camera.quaternion.toArray()),
      up: Object.freeze(camera.up.toArray()),
      target: Object.freeze(ctl.target.toArray()),
      projection: Object.freeze({
        zoom: camera.zoom, fov: camera.fov, near: camera.near,
        far: camera.far, filmOffset: camera.filmOffset,
      }),
      view: camera.view ? Object.freeze({ ...camera.view }) : null,
      viewport: Object.freeze([canvasHost.clientWidth, canvasHost.clientHeight]),
      controls: Object.freeze(Object.fromEntries(controlKeys.map((key) => [key, ctl[key]]))),
    });
  }

  /** @param {any} view @param {readonly number[]} viewport */
  function restoreView(view, viewport) {
    const [oldWidth, oldHeight] = viewport;
    const width = Math.max(1, canvasHost.clientWidth);
    const height = Math.max(1, canvasHost.clientHeight);
    if (view?.enabled) {
      const sx = width / Math.max(1, oldWidth);
      const sy = height / Math.max(1, oldHeight);
      camera.setViewOffset(view.fullWidth * sx, view.fullHeight * sy,
        view.offsetX * sx, view.offsetY * sy, view.width * sx, view.height * sy);
    } else {
      camera.aspect = width / height;
      camera.clearViewOffset();
    }
  }

  function apply(snapshot) {
    camera.position.fromArray(snapshot.position);
    camera.quaternion.fromArray(snapshot.orientation);
    camera.up.fromArray(snapshot.up);
    ctl.target.fromArray(snapshot.target);
    Object.assign(camera, snapshot.projection);
    restoreView(snapshot.view, snapshot.viewport);
    camera.updateMatrixWorld();
  }

  function drain() {
    ctl.autoRotate = false;
    ctl.enableDamping = false;
    ctl.update();
  }

  function acquire(snapshot) {
    if (leased) throw new Error("The museum camera is already in use.");
    releaseFlight();
    leased = true;
    ctl.enabled = false;
    // OrbitControls still updates with enabled=false. One undamped update
    // consumes its pending orbit/pan deltas before we reapply the entry pose.
    drain();
    apply(snapshot);
  }

  function release(snapshot) {
    apply(snapshot);
    Object.assign(ctl, snapshot.controls, { autoRotate: false });
    leased = false;
  }

  function arc(a, b, t) {
    const dot = clamp(a.dot(b), -1, 1);
    if (dot > 0.99999) return a.clone().lerp(b, t).normalize();
    const angle = Math.acos(dot);
    const tangent = b.clone().addScaledVector(a, -dot);
    if (tangent.lengthSq() < 1e-12) {
      tangent.crossVectors(a, Math.abs(a.y) < 0.8
        ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0));
    }
    return a.clone().multiplyScalar(Math.cos(angle * t))
      .addScaledVector(tangent.normalize(), Math.sin(angle * t));
  }

  function sampleTo(destination, framing = () => [0, 0]) {
    const start = camera.position.clone();
    const end = new THREE.Vector3().fromArray(destination.position);
    const a = start.clone().normalize();
    const b = end.clone().normalize();
    const startDistance = Math.log(start.length());
    const endDistance = Math.log(end.length());
    const startTarget = ctl.target.clone();
    const endTarget = new THREE.Vector3().fromArray(destination.target);
    const baseView = camera.view?.enabled ? { ...camera.view } : null;
    const initialOffset = baseView
      ? [baseView.offsetX / baseView.fullWidth, baseView.offsetY / baseView.fullHeight] : [0, 0];
    return (progress) => {
      camera.position.copy(arc(a, b, progress))
        .multiplyScalar(Math.exp(mix(startDistance, endDistance, progress)));
      ctl.target.copy(startTarget).lerp(endTarget, progress);
      camera.lookAt(ctl.target);
      const width = Math.max(1, canvasHost.clientWidth);
      const height = Math.max(1, canvasHost.clientHeight);
      const [x, y] = framing();
      camera.setViewOffset(width, height,
        mix(initialOffset[0], x, progress) * width,
        mix(initialOffset[1], y, progress) * height, width, height);
      camera.updateMatrixWorld();
    };
  }

  function altitudePose({ lat, lng, altitude }) {
    const { x, y, z } = globe.getCoords(lat, lng, altitude);
    return { position: [x, y, z], target: [0, 0, 0] };
  }

  function legacyFlight(pov, duration) {
    if (leased) return;
    releaseFlight();
    if (!duration || reducedMotion()) {
      globe.pointOfView(pov, 0);
      return;
    }
    const current = capture();
    drain();
    apply(current);
    ctl.enableDamping = current.controls.enableDamping;
    ctl.autoRotate = current.controls.autoRotate;
    const sample = sampleTo(altitudePose(pov));
    releaseFlight = tween(duration, sample, () => {
      restoreView(current.view, current.viewport);
      releaseFlight = () => {};
    });
  }

  function project(lat, lng) {
    const { x, y, z } = globe.getCoords(lat, lng, 0);
    const anchor = new THREE.Vector3(x, y, z);
    // A sphere's surface point is visible iff the outgoing ray toward the
    // camera stays above the surface tangent plane at that point.
    if (anchor.dot(camera.position) <= surfaceRadius ** 2) return null;
    camera.updateMatrixWorld();
    const ndc = anchor.project(camera);
    if (Math.abs(ndc.x) > 1 || Math.abs(ndc.y) > 1 || Math.abs(ndc.z) > 1) return null;
    const rect = canvasHost.getBoundingClientRect();
    return {
      x: rect.left + (ndc.x + 1) * rect.width / 2,
      y: rect.top + (1 - ndc.y) * rect.height / 2,
    };
  }

  return {
    capture, acquire, release, apply, project, legacyFlight, altitudePose, sampleTo,
    get leased() { return leased; },
    cancelFlight() { releaseFlight(); releaseFlight = () => {}; },
  };
}
