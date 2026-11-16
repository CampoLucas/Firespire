import { element } from "./dom.mjs";

export function createWaypointTooltip(marker, exhibit, signal) {
  const tooltip = element("span", "museum-waypoint-tooltip");
  tooltip.id = `waypoint-tooltip-${exhibit.id}`;
  tooltip.setAttribute("role", "tooltip");
  const window = element("div", "museum-tooltip-window");
  const title = element("b", "museum-tooltip-text", exhibit.title);
  window.append(title);
  tooltip.append(window, element("small", "", `${exhibit.isMock ? "Fictional" : "Event"}${exhibit.approximate ? " · approximate location" : ""}`));
  marker.setAttribute("aria-describedby", tooltip.id);
  const measure = () => {
    tooltip.style.setProperty("--tooltip-shift", "0px");
    const overflow = Math.max(0, title.scrollWidth - window.clientWidth);
    tooltip.classList.toggle("has-overflow", overflow > 1);
    tooltip.style.setProperty("--tooltip-overflow", `${overflow}px`);
    tooltip.style.setProperty("--tooltip-duration", `${Math.max(12, overflow / 16)}s`);
    const rect = tooltip.getBoundingClientRect();
    const shift = rect.left < 12 ? 12 - rect.left : rect.right > innerWidth - 12 ? innerWidth - 12 - rect.right : 0;
    tooltip.style.setProperty("--tooltip-shift", `${shift}px`);
  };
  marker.addEventListener("pointerenter", measure, { signal });
  marker.addEventListener("focus", measure, { signal });
  const observer = new ResizeObserver(measure);
  observer.observe(window);
  signal.addEventListener("abort", () => observer.disconnect(), { once: true });
  return tooltip;
}
