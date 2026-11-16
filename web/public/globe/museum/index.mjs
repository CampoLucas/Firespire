import { validateCatalog } from "./validate.mjs";
import { validateCuratedExhibits } from "./curated-validate.mjs";
import { CURATED_TAGLINE } from "./curated.mjs";
import { button, element } from "./dom.mjs";
import { createBoard } from "./board-view.mjs";
import { interpolatePose, travelSpec } from "./board-camera.mjs";
import { mix, reducedMotion, tween } from "./motion.mjs";
import { startCountdown } from "./readiness.mjs";
import { createWaypointTooltip } from "./waypoint-tooltip.mjs";
import { initial, reduce, Stage } from "./state.mjs";

const INTRO_MS = 15000;

export function mountMuseum({ exhibits, adapter, globe, controls, legacy }) {
  const mock = exhibits.filter(({ isMock }) => isMock);
  if (mock.length) validateCatalog(mock);
  if (mock.length < exhibits.length) validateCuratedExhibits(exhibits.filter(({ isMock }) => !isMock));
  const lifetime = new AbortController();
  const { signal } = lifetime;
  const root = element("div", "museum-root");
  root.lang = "en";
  root.dataset.stage = Stage.globe;
  const markers = element("div", "museum-markers");
  const dock = element("nav", "museum-dock");
  dock.setAttribute("aria-label", exhibits.every(({ isMock }) => isMock)
    ? "Museum of Fire fictional waypoints" : "Museum of Fire events");
  dock.append(element("span", "museum-dock-label", "Museum of Fire"));
  const markerRecords = exhibits.map((exhibit) => {
    const marker = button(`museum-marker museum-marker--${exhibit.marker}${exhibit.approximate ? " museum-marker--approx" : ""}`, "", (event) => {
      select(exhibit, event.currentTarget);
    });
    const shape = element("i");
    marker.setAttribute("aria-label", `${exhibit.title}. ${exhibit.isMock ? "Fictional exhibit" : "Event"}${exhibit.approximate ? ", approximate location" : ""}`);
    shape.setAttribute("aria-hidden", "true");
    // Tooltip de su propio mecanismo (waypoint-tooltip.mjs): título completo, desplazable si no entra, y fuera de pantalla nunca.
    marker.append(shape, createWaypointTooltip(marker, exhibit, signal));
    const link = button(`museum-dock-link museum-marker--${exhibit.marker}`, "", (event) => {
      select(exhibit, event.currentTarget);
    });
    const icon = element("i");
    icon.setAttribute("aria-hidden", "true");
    link.append(icon, document.createTextNode(exhibit.short));
    link.setAttribute("aria-label", `${exhibit.isMock ? "Open fictional exhibit" : "Open event"}: ${exhibit.title}`);
    markers.append(marker);
    dock.append(link);
    return { exhibit, marker, link };
  });

  const exit = button("museum-exit", "← Back to globe", () => dispatch({ type: "exit" }));
  exit.hidden = true;
  const intro = element("section", "museum-intro");
  intro.setAttribute("aria-label", "Waypoint introduction");
  intro.hidden = true;
  const live = element("div", "museum-visually-hidden");
  live.setAttribute("aria-live", "polite");
  root.append(markers, dock, intro, exit, live);
  document.body.append(root);
  document.body.classList.add("has-museum");

  let state = initial();
  let session = null;
  let scheduled = 0;

  function refresh() {
    cancelAnimationFrame(scheduled);
    scheduled = 0;
    const available = !session && legacy.available();
    dock.hidden = Boolean(session) || !available;
    for (const record of markerRecords) {
      const { exhibit, marker, link } = record;
      link.disabled = !available;
      const show = available || (session?.exhibit === exhibit && session.introOpacity > .25);
      const coordinates = show ? adapter.project(exhibit.lat, exhibit.lng) : null;
      marker.hidden = !coordinates;
      if (!coordinates) continue;
      // `translate` (with left/top fixed at 0 in CSS) moves the marker without triggering layout.
      marker.style.translate = `${coordinates.x}px ${coordinates.y}px`;
      marker.classList.toggle("is-selected", Boolean(session));
      marker.disabled = Boolean(session);
    }
  }

  function refreshSoon() {
    if (!scheduled) scheduled = requestAnimationFrame(refresh);
  }

  function presentation(blend, introOpacity) {
    session.blend = blend;
    session.introOpacity = introOpacity;
    intro.style.opacity = String(introOpacity);
    intro.style.transform = `translateY(${blend * -14}px) scale(${1 - blend * .025})`;
    const board = session.board?.root;
    if (board) {
      // "Warm" = painted at near-zero opacity while the intro is open, so the
      // board is already rasterised and decoded when the opening starts.
      const warm = blend === 0 && session.warm;
      board.style.opacity = warm ? ".001" : String(blend);
      board.style.visibility = blend > 0 || warm ? "visible" : "hidden";
    }
    refreshSoon();
  }

  function fillIntro(exhibit) {
    const heading = element("h1", "", exhibit.title);
    heading.id = "museum-exhibit-title";
    const start = button("museum-start", "Start investigation  →", () => dispatch({ type: "start" }));
    const progress = element("div", "museum-countdown");
    const bar = element("i");
    progress.setAttribute("role", "progressbar");
    progress.setAttribute("aria-label", "Automatic entry in fifteen seconds");
    progress.setAttribute("aria-valuemin", "0");
    progress.setAttribute("aria-valuemax", "15");
    progress.setAttribute("aria-valuenow", "0");
    progress.append(bar);
    const countdown = element("p", "museum-countdown-label", "Auto-start in 15 s");
    const actions = element("div", "museum-preview-actions");
    const timer = element("div", "museum-preview-timer");
    timer.append(countdown, progress);
    actions.append(start, timer);
    intro.replaceChildren(
      element("p", "museum-kicker", `Museum of Fire / ${exhibit.origin}`),
      heading,
      element("p", "museum-intro-location", `${exhibit.region} · ${exhibit.period}`),
      element("p", "museum-intro-summary", exhibit.summary),
      element("p", "museum-intro-disclosure", exhibit.isMock
        ? "Fictional exhibit. Its dates are independent of the activity filters." : CURATED_TAGLINE),
      actions,
    );
    intro.hidden = false;
    intro.inert = false;
    return { progress, bar, countdown, start };
  }

  function frameAnchor() {
    const rect = intro.getBoundingClientRect();
    const portrait = matchMedia("(max-width: 699px) and (orientation: portrait)").matches;
    if (portrait) return [0, .5 - (Math.max(60, rect.top) + 62) / (2 * innerHeight)];
    return [.5 - Math.max(40, rect.left) / (2 * innerWidth), 0];
  }

  function motion(duration, sample, completion) {
    session.cancelMotion?.();
    const token = { session: state.session, motion: state.motion };
    session.cancelMotion = tween(reducedMotion() ? 0 : duration, (t) => {
      if (state.session === token.session && state.motion === token.motion) sample(t);
    }, () => {
      if (state.session === token.session && state.motion === token.motion) completion(token);
    });
  }

  function step(direction) {
    if (!session || state.target == null) return;
    const items = session.exhibit.items;
    const at = items.findIndex(({ id }) => id === state.target);
    const next = items[at + direction];
    if (next) dispatch({ type: "focus", id: next.id });
  }

  function clearCountdown(s) {
    s.cancelCountdown?.();
    clearTimeout(s.timer);
    cancelAnimationFrame(s.counterFrame);
  }

  function cancelBoardBuild(s) {
    if (s.buildHandle == null) return;
    if (s.buildIdle) cancelIdleCallback(s.buildHandle);
    else clearTimeout(s.buildHandle);
    s.buildHandle = null;
  }

  function scheduleBoard(s) {
    if (s.board || s.buildHandle != null) return;
    const build = () => {
      s.buildHandle = null;
      if (session === s && state.stage === Stage.intro) ensureBoard(s);
    };
    s.buildIdle = typeof requestIdleCallback === "function";
    s.buildHandle = s.buildIdle ? requestIdleCallback(build, { timeout: 600 }) : setTimeout(build, 60);
  }

  /** Builds and mounts the board once per session; returns it, or null if it failed. */
  function ensureBoard(s) {
    if (s.board) return s.board;
    if (session !== s || s.boardFailed) return null;
    cancelBoardBuild(s);
    try {
      s.board = createBoard(s.exhibit, {
        select: (id) => dispatch({ type: "focus", id }),
        overview: () => dispatch({ type: "focus", id: null, force: true }),
        step,
        navigate: (pose) => dispatch({ type: "navigate", pose }),
      });
      s.board.root.inert = true;
      root.insertBefore(s.board.root, exit);
      s.pose = s.board.pose();
      s.board.setCamera(s.pose, true);
      // Painted invisibly (see presentation) so the opening does not pay for first raster.
      s.warm = true;
      presentation(s.blend, s.introOpacity);
    } catch (error) {
      console.error("Museum exhibit preparation failed", error);
      s.boardFailed = true;
      s.board?.root.remove();
      s.board = null;
      dispatch({ type: "exit" });
      return null;
    }
    return s.board;
  }

  function select(exhibit, trigger) {
    if (state.stage !== Stage.globe || !legacy.available()) return;
    const snapshot = adapter.capture();
    const original = legacy.lock();
    adapter.acquire(snapshot);
    session = { exhibit, trigger, snapshot, original, blend: 0, introOpacity: 1, paused: false };
    dispatch({ type: "select" });
  }

  /** @param {import("./contracts").MuseumEvent} event */
  function dispatch(event) {
    const next = reduce(state, event, session?.exhibit.items.map(({ id }) => id));
    if (next === state) return;
    state = next;
    root.dataset.stage = state.stage;
    document.body.dataset.museumStage = state.stage;
    const s = session;
    switch (event.type) {
      case "select": {
        exit.hidden = false;
        exit.disabled = false;
        exit.textContent = "← Back to globe";
        s.preview = fillIntro(s.exhibit);
        intro.style.visibility = "hidden";
        presentation(0, 1);
        live.textContent = `Approaching ${s.exhibit.title}`;
        // The intro does not move during the approach: measure its frame once, not per frame.
        const anchor = frameAnchor();
        const approach = adapter.sampleTo(adapter.altitudePose(s.exhibit), () => anchor);
        motion(780, (t) => { approach(t); refreshSoon(); },
          (token) => dispatch({ type: "arrived", ...token }));

        break;
      }
      case "arrived": {
        // The camera is idle and the intro stays up for a while: build the board now.
        scheduleBoard(s);
        intro.style.visibility = "visible";
        s.preview.start.focus({ preventScroll: true });
        s.counterFrame = requestAnimationFrame(() => {
          if (session !== s || state.stage !== Stage.intro) return;
          let shown = -1;
          s.cancelCountdown = startCountdown(INTRO_MS, (elapsed) => {
            s.preview.bar.style.transform = `scaleX(${elapsed / INTRO_MS})`;
            // Text and ARIA only change once per second; rewriting them every frame dirties layout.
            const second = Math.floor(elapsed / 1000);
            if (second === shown) return;
            shown = second;
            s.preview.progress.setAttribute("aria-valuenow", String(second));
            s.preview.countdown.textContent = `Auto-start in ${Math.ceil((INTRO_MS - elapsed) / 1000)} s`;
          }, () => { if (session === s) dispatch({ type: "start", session: state.session }); });
        });
        break;
      }
      case "start": {
        clearCountdown(s);
        intro.inert = true;
        // Normally built during the intro; if the user was faster, build it now.
        if (!ensureBoard(s)) break;
        // Layout, viewport size and the anchor are measured once. Reading them per
        // frame forced a synchronous layout on every tick of the opening.
        const overview = s.board.pose();
        const anchor = frameAnchor();
        const dive = adapter.sampleTo(adapter.altitudePose({ ...s.exhibit, altitude: s.exhibit.altitude * .75 }), () => anchor);
        s.overview = overview;
        motion(730, (t) => {
          dive(t);
          s.pose = { ...s.overview, scale: s.overview.scale * mix(.81, 1, t) };
          s.board.setCamera(s.pose);
          presentation(t, 1 - t);
        }, (token) => dispatch({ type: "board", ...token }));
        break;
      }
      case "board":
        intro.hidden = true;
        s.board.setCamera(s.pose, true);
        s.board.root.inert = false;
        globe.pauseAnimation();
        s.paused = true;
        if (!document.activeElement?.closest(".museum-exit")) {
          s.board.title.focus({ preventScroll: true });
        }
        live.textContent = "Investigation board. Choose any pinned item.";
        refreshSoon();
        break;
      case "focus": {
        const from = s.pose;
        const target = state.target;
        s.dest = s.board.pose(target);
        const { duration, retreat } = travelSpec(from, s.dest, s.board.pose().scale);
        s.board.mark(target);
        motion(duration, (t) => {
          s.pose = interpolatePose(from, s.dest, t, retreat);
          s.board.setCamera(s.pose);
        }, (token) => dispatch({ type: "settle", ...token }));
        break;
      }
      case "navigate":
        s.cancelMotion?.();
        s.pose = s.board.setCamera(event.pose, true);
        s.board.mark(state.target, true);
        break;
      case "settle":
        s.board.setCamera(s.pose, true);
        s.board.mark(state.target, true);
        if (state.target && document.activeElement === document.body) s.board.focusEvidence(state.target);
        if (!state.target && document.activeElement === document.body) s.board.title.focus({ preventScroll: true });
        live.textContent = state.target
          ? s.exhibit.items.find(({ id }) => id === state.target).title : "Whole board";
        refreshSoon();
        break;
      case "exit": {
        clearCountdown(s);
        cancelBoardBuild(s);
        s.warm = false;
        intro.inert = true;
        if (s.board) s.board.root.inert = true;
        exit.textContent = "Returning to globe…";
        exit.disabled = true;
        live.textContent = exit.textContent;
        if (s.paused) globe.resumeAnimation();
        s.paused = false;
        const blend = s.blend;
        const introOpacity = s.introOpacity;
        const from = s.pose;
        const view = s.snapshot.view;
        const fly = adapter.sampleTo(s.snapshot, () => view?.enabled
          ? [view.offsetX / view.fullWidth, view.offsetY / view.fullHeight] : [0, 0]);
        motion(625, (t) => {
          fly(t);
          if (from) s.board.setCamera({ ...from, scale: from.scale * mix(1, .88, t) });
          presentation(blend * (1 - t), introOpacity * (1 - t));
        }, (token) => {
          adapter.apply(s.snapshot);
          // Let the renderer show the restored pose before unlocking rotation.
          s.cancelMotion = tween(0, () => {}, () => dispatch({ type: "restored", ...token }));
        });
        break;
      }
      case "restored":
        adapter.release(s.snapshot);
        s.board?.dispose();
        s.board?.root.remove();
        intro.hidden = true;
        intro.replaceChildren();
        exit.hidden = true;
        session = null;
        legacy.unlock(s.original, s.snapshot.controls.autoRotate);
        refresh();
        if (!s.trigger.hidden) s.trigger.focus({ preventScroll: true });
        else markerRecords.find(({ exhibit }) => exhibit === s.exhibit)?.link.focus({ preventScroll: true });
        live.textContent = "Globe restored";
        break;
    }
  }

  const onResize = () => {
    session?.board?.invalidate();
    if (session?.board && [Stage.board, Stage.evidence].some((stage) => stage === state.stage)) {
      session.pose = session.board.pose(state.target);
      session.board.setCamera(session.pose, true);
    }
    // A resize mid-animation retargets the motion that is running.
    if (session?.board && state.stage === Stage.entering) session.overview = session.board.pose();
    if (session?.board && state.stage === Stage.travel) session.dest = session.board.pose(state.target);
    if (state.stage === Stage.intro) {
      adapter.sampleTo(adapter.altitudePose(session.exhibit), frameAnchor)(1);
    }
    refreshSoon();
  };
  window.addEventListener("resize", onResize, { signal });
  document.addEventListener("scroll", refreshSoon, { capture: true, passive: true, signal });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && session) {
      event.preventDefault();
      dispatch({ type: "exit" });
    }
    if (![Stage.travel, Stage.evidence].some((stage) => stage === state.stage) ||
        !(event.target instanceof Element) || event.target.closest("input,select,textarea,.museum-paper-body")) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      step(event.key === "ArrowLeft" ? -1 : 1);
    }
  }, { signal });
  controls.addEventListener("change", refreshSoon);
  const calendar = document.querySelector("#cal");
  calendar?.addEventListener("keydown", (event) => {
    if (!(event instanceof KeyboardEvent) || !(event.target instanceof Element)) return;
    const day = event.target.closest("[data-d]");
    if (!day) return;
    if (["Enter", " "].includes(event.key)) {
      event.preventDefault();
      day.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }
    if (["ArrowLeft", "ArrowRight"].includes(event.key)) {
      const days = Array.from(calendar.querySelectorAll("[data-d]"));
      const next = days[days.indexOf(day) + (event.key === "ArrowRight" ? 1 : -1)];
      if (!(next instanceof HTMLElement || next instanceof SVGElement)) return;
      event.preventDefault();
      day.setAttribute("tabindex", "-1");
      next.setAttribute("tabindex", "0");
      next.focus();
    }
  }, { signal });
  function keyboardDays() {
    for (const day of calendar?.querySelectorAll("[data-d]") ?? []) {
      // Keep one keyboard entry point in the calendar; the date controls
      // remain available for period navigation without hundreds of tab stops.
      day.setAttribute("tabindex", "-1");
      day.setAttribute("aria-label", legacy.dayLabel(Number(day.getAttribute("data-d"))));
    }
    (calendar?.querySelector("[aria-pressed='true'][data-d],.d.sel") ?? calendar?.querySelector("[data-d]"))?.setAttribute("tabindex", "0");
  }
  const observer = new MutationObserver(() => { keyboardDays(); refreshSoon(); });
  if (calendar) observer.observe(calendar, { childList: true, subtree: true });
  const visibility = new MutationObserver(refreshSoon);
  visibility.observe(document.body, { attributes: true, attributeFilter: ["data-experience"] });
  keyboardDays();
  refresh();
  return {
    refresh: refreshSoon,
    dispose() {
      lifetime.abort();
      observer.disconnect();
      visibility.disconnect();
      controls.removeEventListener("change", refreshSoon);
      cancelAnimationFrame(scheduled);
      if (session) {
        clearCountdown(session);
        cancelBoardBuild(session);
        session.cancelMotion?.();
        if (session.paused) globe.resumeAnimation();
        adapter.release(session.snapshot);
        legacy.unlock(session.original, session.snapshot.controls.autoRotate);
      }
      session?.board?.dispose();
      root.remove();
      document.body.classList.remove("has-museum");
    },
  };
}
