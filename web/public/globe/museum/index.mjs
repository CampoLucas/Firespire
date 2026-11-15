import { exhibits } from "./catalog.mjs";
import { validateCatalog } from "./validate.mjs";
import { legacyAnnotations, waypointHelp } from "./annotations.mjs";
import { annotate, button, element } from "./dom.mjs";
import { createBoard } from "./board-view.mjs";
import { interpolatePose, travelSpec } from "./board-camera.mjs";
import { createDeveloperOverlay } from "./developer-overlay.mjs";
import { clamp, mix, reducedMotion, tween } from "./motion.mjs";
import { initial, reduce, Stage } from "./state.mjs";

const INTRO_MS = 5000;

export function mountMuseum({ adapter, globe, controls, legacy }) {
  validateCatalog(exhibits);
  const lifetime = new AbortController();
  const { signal } = lifetime;
  const root = element("div", "museum-root");
  root.lang = "en";
  root.dataset.stage = Stage.globe;
  const markers = element("div", "museum-markers");
  const dock = element("nav", "museum-dock");
  dock.setAttribute("aria-label", "Museum of Fires fictional waypoints");
  dock.append(element("span", "museum-dock-label", "Museum of Fires"));
  const markerRecords = exhibits.map((exhibit) => {
    const help = waypointHelp(exhibit);
    const marker = annotate(button(`museum-marker museum-marker--${exhibit.marker}`, "", (event) => {
      select(exhibit, event.currentTarget);
    }), exhibit.title, help);
    const shape = element("i");
    shape.setAttribute("aria-hidden", "true");
    marker.append(shape, element("span", "", `${exhibit.short} · Fictional`));
    const link = annotate(button(`museum-dock-link museum-marker--${exhibit.marker}`, "", (event) => {
      select(exhibit, event.currentTarget);
    }), exhibit.title, help);
    const icon = element("i");
    icon.setAttribute("aria-hidden", "true");
    link.append(icon, document.createTextNode(exhibit.short));
    link.setAttribute("aria-label", `Open fictional exhibit: ${exhibit.title}`);
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
  let cell = null;

  const existing = [
    ["#legend", "Globe burning activity", "activity"], ["#tip", "Globe activity under the pointer", "activity"],
    ["#kN", "Detection count", "count"], ["#kF", "Fire radiative power", "frp"], ["#kA", "Grid area with activity", "area"],
    ["#cal", "Burning activity calendar", "calendar"], ["#perLbl", "Selected time period", "calendar"],
    ["#dayChip", "Selected calendar day", "calendar"], ["#alFrom", "Observed activity alerts", "alerts"],
    ["#banner", "Observed activity alert banner", "alerts"], ["#planPh", "Priority zones", "alerts"],
    ["#planCard", "Selected planning alert", "alerts"],
  ].map(([selector, title, key]) => {
    const node = document.querySelector(selector);
    return node && annotate(node, title, legacyAnnotations[key]);
  }).filter(Boolean);

  const overlay = createDeveloperOverlay(root, () => {
    const projected = markerRecords.map(({ marker }) => marker);
    if (!session) return [...existing, cell, ...projected, ...markerRecords.map(({ link }) => link)];
    const boardTargets = session.blend > .32 && session.board
      ? [...session.board.root.querySelectorAll("[data-museum-help]")] : [];
    // Preserve live annotations as a scene blends. Annotation buttons use
    // their own hit targets even while the board itself is inert.
    return [...(session.introOpacity > .22 ? [intro] : []), ...projected, ...boardTargets];
  }, signal);

  function refresh() {
    cancelAnimationFrame(scheduled);
    scheduled = 0;
    const available = !session && legacy.available();
    dock.hidden = Boolean(session) || !legacy.inAnalysis();
    for (const { exhibit, marker, link } of markerRecords) {
      link.disabled = !available;
      const show = available || (session?.exhibit === exhibit && session.introOpacity > .25);
      const coordinates = show ? adapter.project(exhibit.lat, exhibit.lng) : null;
      marker.hidden = !coordinates;
      if (!coordinates) continue;
      marker.style.left = `${coordinates.x}px`;
      marker.style.top = `${coordinates.y}px`;
      marker.classList.toggle("is-selected", Boolean(session));
      marker.disabled = Boolean(session);
    }
    overlay.update();
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
      board.style.opacity = String(blend);
      board.style.visibility = blend > 0 ? "visible" : "hidden";
    }
    refreshSoon();
  }

  function fillIntro(exhibit) {
    annotate(intro, "Waypoint introduction", waypointHelp(exhibit, true));
    const heading = element("h1", "", exhibit.title);
    heading.id = "museum-exhibit-title";
    const start = button("museum-start", "Start investigation  →", () => dispatch({ type: "start" }));
    const progress = element("div", "museum-countdown");
    const bar = element("i");
    progress.setAttribute("role", "progressbar");
    progress.setAttribute("aria-label", "Automatic entry in five seconds");
    progress.setAttribute("aria-valuemin", "0");
    progress.setAttribute("aria-valuemax", "5");
    progress.setAttribute("aria-valuenow", "0");
    progress.append(bar);
    intro.replaceChildren(
      element("p", "museum-kicker", `Museum of Fires / ${exhibit.origin}`),
      heading,
      element("p", "museum-intro-location", `${exhibit.region} · ${exhibit.period}`),
      element("p", "museum-intro-summary", exhibit.summary),
      element("p", "museum-intro-disclosure", "Fictional exhibit. Its dates are independent of the activity filters."),
      start, progress,
    );
    intro.hidden = false;
    intro.inert = false;
    start.focus({ preventScroll: true });
    return { progress, bar };
  }

  function frameAnchor() {
    const rect = intro.getBoundingClientRect();
    const portrait = matchMedia("(max-width: 720px) and (orientation: portrait)").matches;
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
    clearTimeout(s.timer);
    cancelAnimationFrame(s.counterFrame);
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
    const s = session;
    switch (event.type) {
      case "select": {
        exit.hidden = false;
        exit.disabled = false;
        exit.textContent = "← Back to globe";
        const { progress, bar } = fillIntro(s.exhibit);
        presentation(0, 1);
        live.textContent = `Approaching ${s.exhibit.title}`;
        const approach = adapter.sampleTo(adapter.altitudePose(s.exhibit), frameAnchor);
        motion(1250, (t) => { approach(t); refreshSoon(); },
          (token) => dispatch({ type: "arrived", ...token }));

        s.counterFrame = requestAnimationFrame((start) => {
          const token = { session: state.session };
          const deadline = start + INTRO_MS;
          const expire = () => dispatch({ type: "start", ...token });
          function tick(now) {
            const elapsed = clamp(now - start, 0, INTRO_MS);
            bar.style.transform = `scaleX(${elapsed / INTRO_MS})`;
            progress.setAttribute("aria-valuenow", String(Math.floor(elapsed / 1000)));
            if (elapsed === INTRO_MS) expire();
            else s.counterFrame = requestAnimationFrame(tick);
          }
          s.timer = setTimeout(expire, Math.max(0, deadline - performance.now()));
          tick(start);
        });

        try {
          s.board = createBoard(s.exhibit, {
            select: (id) => dispatch({ type: "focus", id }),
            overview: () => dispatch({ type: "focus", id: null }),
            step,
          });
          s.board.root.inert = true;
          root.insertBefore(s.board.root, exit);
          s.pose = s.board.pose();
          s.board.setCamera(s.pose);
        } catch (error) {
          console.error("Museum exhibit preparation failed", error);
          dispatch({ type: "exit" });
        }
        break;
      }
      case "start": {
        clearCountdown(s);
        intro.inert = true;
        const dive = adapter.sampleTo(adapter.altitudePose({ ...s.exhibit, altitude: s.exhibit.altitude * .75 }), frameAnchor);
        motion(900, (t) => {
          dive(t);
          const overview = s.board.pose();
          s.pose = { ...overview, scale: overview.scale * mix(.81, 1, t) };
          s.board.setCamera(s.pose);
          presentation(t, 1 - t);
        }, (token) => dispatch({ type: "board", ...token }));
        break;
      }
      case "board":
        intro.hidden = true;
        s.board.root.inert = false;
        globe.pauseAnimation();
        s.paused = true;
        if (!document.activeElement?.closest(".museum-dev-switch,.museum-help-trigger,.museum-help-pop,.museum-exit")) {
          s.board.title.focus({ preventScroll: true });
        }
        live.textContent = "Investigation board. Choose any pinned item.";
        refreshSoon();
        break;
      case "focus": {
        const from = s.pose;
        const target = state.target;
        const { duration, retreat } = travelSpec(from, s.board.pose(target), s.board.pose().scale);
        s.board.mark(target);
        motion(duration, (t) => {
          s.pose = interpolatePose(from, s.board.pose(target), t, retreat);
          s.board.setCamera(s.pose);
          refreshSoon();
        }, (token) => dispatch({ type: "settle", ...token }));
        break;
      }
      case "settle":
        s.board.mark(state.target, true);
        if (state.target && document.activeElement === document.body) s.board.focusEvidence(state.target);
        if (!state.target && document.activeElement === document.body) s.board.title.focus({ preventScroll: true });
        live.textContent = state.target
          ? s.exhibit.items.find(({ id }) => id === state.target).title : "Whole board";
        refreshSoon();
        break;
      case "exit": {
        clearCountdown(s);
        intro.inert = true;
        if (s.board) s.board.root.inert = true;
        overlay.close();
        exit.textContent = "Returning to globe…";
        exit.disabled = true;
        live.textContent = exit.textContent;
        if (s.paused) globe.resumeAnimation();
        const blend = s.blend;
        const introOpacity = s.introOpacity;
        const from = s.pose;
        const view = s.snapshot.view;
        const fly = adapter.sampleTo(s.snapshot, () => view?.enabled
          ? [view.offsetX / view.fullWidth, view.offsetY / view.fullHeight] : [0, 0]);
        motion(960, (t) => {
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
    if (session?.board && [Stage.board, Stage.evidence].some((stage) => stage === state.stage)) {
      session.pose = session.board.pose(state.target);
      session.board.setCamera(session.pose);
    }
    if (state.stage === Stage.intro) {
      adapter.sampleTo(adapter.altitudePose(session.exhibit), frameAnchor)(1);
    }
    refreshSoon();
  };
  window.addEventListener("resize", onResize, { signal });
  document.addEventListener("scroll", refreshSoon, { capture: true, passive: true, signal });
  document.addEventListener("keydown", (event) => {
    if (overlay.escape(event)) {
      event.preventDefault();
      return;
    }
    if (event.key === "Escape" && session) {
      event.preventDefault();
      dispatch({ type: "exit" });
    }
    if (![Stage.travel, Stage.evidence].some((stage) => stage === state.stage) ||
        !(event.target instanceof Element) || event.target.closest("input,select,textarea,.museum-paper-body,.museum-help-pop,.museum-help-trigger")) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      step(event.key === "ArrowLeft" ? -1 : 1);
    }
  }, { signal });
  controls.addEventListener("change", refreshSoon);
  const calendar = document.querySelector("#cal");
  const watchCell = (event) => {
    const node = event.target.closest("[data-d]");
    if (!node || node === cell) return;
    cell = annotate(node, `Calendar day · ${legacy.dayLabel(Number(node.dataset.d))}`, {
      ...legacyAnnotations.calendar,
      role: "This day shows the raw detection count after the selected globe filters. Select the cell to display that day.",
    });
    refreshSoon();
  };
  calendar?.addEventListener("pointerover", watchCell, { signal });
  calendar?.addEventListener("focusin", watchCell, { signal });
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
  for (const node of existing) visibility.observe(node, { attributes: true, attributeFilter: ["hidden", "class"] });
  const viewSwitch = document.querySelector("#viewSw");
  if (viewSwitch) visibility.observe(viewSwitch, { attributes: true, attributeFilter: ["aria-busy", "data-v"] });
  const busy = document.querySelector("#busy");
  if (busy) visibility.observe(busy, { attributes: true, attributeFilter: ["hidden"] });
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
        session.cancelMotion?.();
        if (session.paused) globe.resumeAnimation();
        adapter.release(session.snapshot);
        legacy.unlock(session.original, session.snapshot.controls.autoRotate);
      }
      overlay.close();
      root.remove();
      document.body.classList.remove("has-museum");
    },
  };
}
