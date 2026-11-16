import { button, element } from "./dom.mjs";
import { reducedMotion, tween } from "./motion.mjs";

export function mountHud({ globe, adapter, controls, onChange, onInteract = () => {} }) {
  const find = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
  const hero = find("hero");
  const nav = find("world-nav");
  const panels = { filters: find("left"), summary: find("right"), calendar: find("bottom") };
  const triggers = document.querySelectorAll("[data-hud]");
  const mobile = matchMedia("(max-width: 699px)");
  const entry = /** @type {HTMLButtonElement} */ (find("hero-entry"));
  const next = /** @type {HTMLButtonElement} */ (find("continue"));
  let active = "explore";
  let entranceTimer;
  let entering = false;
  let pending = "explore";
  let cancelMotion = () => {};
  const world = adapter.capture();

  const filters = panels.calendar.querySelector(".ctrls");
  const advanced = element("details", "display-settings");
  const toolbar = find("tbar");
  advanced.append(element("summary", "", "Display settings"), toolbar);
  toolbar.hidden = false; // llega oculto en el HTML para que no parpadee antes de montar el HUD
  panels.filters.append(advanced);
  for (const [name, panel] of Object.entries(panels)) {
    const heading = element("header", "drawer-head");
    const title = element("h2", "", name[0].toUpperCase() + name.slice(1));
    const close = button("drawer-close", "×", () => setHud("explore", true));
    close.setAttribute("aria-label", `Close ${name}`);
    title.id = `${name}-title`;
    panel.setAttribute("aria-labelledby", title.id);
    heading.append(title, close);
    panel.prepend(heading);
  }
  // Year / Country / Province van primero, justo debajo del encabezado del cajón
  if (filters) panels.filters.querySelector(".drawer-head")?.after(filters);

  function setHud(name, restoreFocus = false) {
    active = name;
    document.body.dataset.hud = name;
    for (const [key, panel] of Object.entries(panels)) panel.hidden = key !== name;
    for (const trigger of triggers) {
      const selected = trigger.getAttribute("data-hud") === name;
      if (trigger.hasAttribute("aria-expanded")) trigger.setAttribute("aria-expanded", String(selected));
      if (trigger.closest("nav")) {
        if (selected) trigger.setAttribute("aria-current", "page");
        else trigger.removeAttribute("aria-current");
      }
    }
    // abrir cualquier panel cuenta como ver información: detiene la rotación automática
    if (name !== "explore") onInteract();
    if (document.body.dataset.experience === "world") {
      window.dispatchEvent(new Event("resize"));
      if (restoreFocus) nav.querySelector("button")?.focus();
    }
    onChange();
  }

  function heroPose() {
    const destination = adapter.altitudePose({ lat: mobile.matches ? -12 : -8, lng: -69, altitude: mobile.matches ? 2 : 2.35 });
    adapter.sampleTo(destination, () => mobile.matches ? [-.09, -.28] : [-.11, -.03])(1);
  }

  function enter(name = "explore") {
    pending = name;
    if (entering || document.body.dataset.experience !== "hero") return;
    entering = true;
    clearTimeout(entranceTimer);
    document.body.dataset.experience = "entering";
    hero.inert = true;
    nav.inert = true;
    const sample = adapter.sampleTo(world, () => [0, 0]);
    cancelMotion = tween(reducedMotion() ? 0 : 1070, sample, () => {
      adapter.release(world);
      controls.autoRotate = world.controls.autoRotate;
      hero.hidden = true;
      nav.inert = false;
      document.body.dataset.experience = "world";
      setHud(pending);
      if (pending === "explore") find("recenter").focus({ preventScroll: true });
      else panels[pending].querySelector("button")?.focus({ preventScroll: true });
      onChange();
    });
  }

  function schedule() {
    clearTimeout(entranceTimer);
    if (!mobile.matches && document.body.dataset.experience === "hero") entranceTimer = setTimeout(() => enter(), 4800);
  }

  adapter.acquire(world);
  heroPose();
  setHud("explore");
  entry.disabled = next.disabled = false;
  entry.addEventListener("click", () => enter());
  next.addEventListener("click", () => enter());
  hero.addEventListener("click", (event) => {
    if (!mobile.matches && event.target instanceof Element && !event.target.closest("button")) enter();
  });
  for (const trigger of triggers) trigger.addEventListener("click", () => {
    const name = trigger.getAttribute("data-hud") || "explore";
    if (document.body.dataset.experience === "hero") { enter(name); return; }
    if (adapter.leased || document.body.dataset.experience !== "world") return;
    setHud(active === name ? "explore" : name);
    if (active !== "explore") panels[active].querySelector("button")?.focus({ preventScroll: true });
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !adapter.leased && active !== "explore") {
      setHud("explore", true);
      event.preventDefault();
    }
  });
  document.addEventListener("pointerdown", (event) => {
    if (adapter.leased || active === "explore" || !(event.target instanceof Element)) return;
    if (event.target.closest(".panel,[data-hud],.museum-root")) return;
    setHud("explore");
  });
  const globeHost = find("globe");
  globeHost.tabIndex = 0;
  globeHost.setAttribute("role", "region");
  globeHost.setAttribute("aria-label", "Interactive globe. Drag to rotate, use arrow keys to turn, plus and minus to zoom.");
  const zoom = (factor) => {
    if (adapter.leased) return;
    const pose = globe.pointOfView();
    adapter.legacyFlight({ ...pose, altitude: Math.max(.05, Math.min(5, pose.altitude * factor)) }, 240);
  };
  find("zoom-in").addEventListener("click", () => zoom(.81));
  find("zoom-out").addEventListener("click", () => zoom(1.23));
  find("recenter").addEventListener("click", () => {
    if (!adapter.leased) adapter.legacyFlight({ lat: -38, lng: -64, altitude: 1.9 }, 780);
  });
  globeHost.addEventListener("keydown", (event) => {
    if (adapter.leased || event.target !== globeHost) return;
    const pose = globe.pointOfView();
    const directions = { ArrowLeft: [0, -6], ArrowRight: [0, 6], ArrowUp: [6, 0], ArrowDown: [-6, 0] };
    if (directions[event.key]) {
      const [lat, lng] = directions[event.key];
      adapter.legacyFlight({ ...pose, lat: Math.max(-85, Math.min(85, pose.lat + lat)), lng: pose.lng + lng }, 240);
    } else if (["+", "="].includes(event.key)) zoom(.81);
    else if (event.key === "-") zoom(1.23);
    else return;
    event.preventDefault();
  });
  const relocateDock = () => {
    const dock = document.querySelector(".museum-dock");
    if (dock && dock.parentElement !== panels.summary) panels.summary.append(dock);
  };
  const observer = new MutationObserver(relocateDock);
  observer.observe(document.body, { childList: true });
  relocateDock();
  mobile.addEventListener("change", () => { if (!entering && document.body.dataset.experience === "hero") heroPose(); schedule(); });
  window.addEventListener("resize", () => { if (!entering && document.body.dataset.experience === "hero") heroPose(); });
  document.querySelector(".logo")?.addEventListener("click", (event) => {
    event.preventDefault();
    if (document.body.dataset.experience === "hero") enter();
    else if (!adapter.leased) setHud("explore");
  });
  schedule();
  return { dispose() { clearTimeout(entranceTimer); cancelMotion(); observer.disconnect(); } };
}
