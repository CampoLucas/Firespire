import { button, element } from "./dom.mjs";
import { clamp } from "./motion.mjs";

export function createDeveloperOverlay(root, targets, signal) {
  const switchNode = button("museum-dev-switch", "", () => {
    enabled = !enabled;
    switchNode.setAttribute("aria-checked", String(enabled));
    if (!enabled) {
      close();
      for (const node of buttons.values()) node.remove();
      buttons.clear();
    }
    update();
  });
  switchNode.setAttribute("role", "switch");
  switchNode.setAttribute("aria-checked", "false");
  const slider = element("i", "museum-slider");
  slider.setAttribute("aria-hidden", "true");
  switchNode.append(slider, document.createTextNode("Developer View"));
  const pop = element("aside", "museum-help-pop");
  pop.id = "museum-help";
  pop.setAttribute("aria-label", "Data explanation");
  pop.hidden = true;
  pop.tabIndex = 0;
  root.append(switchNode, pop);

  const buttons = new Map();
  let enabled = false;
  let active;
  let pinned = false;
  let timer;
  let suppressFocus = false;

  function close() {
    clearTimeout(timer);
    if (active) buttons.get(active)?.setAttribute("aria-expanded", "false");
    active = null;
    pinned = false;
    pop.hidden = true;
  }

  function planClose() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!pinned && !pop.matches(":focus-within,:hover") &&
        !buttons.get(active)?.matches(":focus,:hover")) close();
    }, 140);
  }

  function placePopover(trigger) {
    const rect = trigger.getBoundingClientRect();
    const above = rect.top - 66;
    const below = innerHeight - rect.bottom - 57;
    const desired = Math.min(pop.scrollHeight + 2, 490);
    const openAbove = above >= desired || above >= below;
    pop.style.maxHeight = `${Math.min(490, openAbove ? above : below)}px`;
    const w = pop.offsetWidth;
    const h = pop.offsetHeight;
    pop.style.left = `${clamp(rect.right - w, 10, innerWidth - w - 10)}px`;
    pop.style.top = `${openAbove ? rect.top - h - 8 : rect.bottom + 8}px`;
  }

  function open(node, shouldPin = false) {
    if (active === node && pinned && shouldPin) { close(); return; }
    if (!shouldPin && pinned && active !== node) return;
    if (active !== node) {
      close();
      const data = node.museumHelp;
      const title = element("h3", "", node.dataset.museumHelp);
      const status = element("p", "museum-kicker", data.status);
      pop.replaceChildren(status, title);
      for (const [label, value] of [
        ["Purpose", data.role], ["Retrieval", data.retrieval],
        ["FIRMS and cross-references", data.relation], ["Limits", data.limits],
      ]) {
        if (!value) continue;
        const line = element("p");
        line.append(element("b", "", label), document.createTextNode(value));
        pop.append(line);
      }
    }
    clearTimeout(timer);
    active = node;
    pinned = pinned || shouldPin;
    const trigger = buttons.get(node);
    if (!trigger) return close();
    trigger.setAttribute("aria-expanded", "true");
    pop.hidden = false;
    placePopover(trigger);
  }

  function makeHelp(node) {
    const help = button("museum-help-trigger", "?", (event) => {
      event.stopPropagation();
      open(node, true);
    });
    help.setAttribute("aria-label", `Explain ${node.dataset.museumHelp}`);
    help.setAttribute("aria-controls", pop.id);
    if (node.id) help.dataset.museumAnchor = node.id;
    help.setAttribute("aria-expanded", "false");
    help.addEventListener("pointerenter", (event) => {
      if (event.pointerType !== "touch") open(node);
    });
    help.addEventListener("pointerleave", planClose);
    help.addEventListener("focus", () => { if (!suppressFocus) open(node); });
    help.addEventListener("blur", planClose);
    help.addEventListener("pointerdown", (event) => event.stopPropagation());
    help.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown" && active === node) {
        event.preventDefault();
        pinned = true;
        pop.focus();
      }
    });
    root.append(help);
    buttons.set(node, help);
    return help;
  }

  function update() {
    if (!enabled) return;
    const visible = new Set();
    const bounds = [];
    for (const node of targets()) {
      if (!node?.isConnected || !node.museumHelp || node.closest("[hidden]") || (node.closest("[inert]") && !node.closest(".museum-scene,.museum-intro"))) continue;
      const rect = node.getBoundingClientRect();
      if (rect.width < 12 || rect.height < 8 || getComputedStyle(node).visibility !== "visible") continue;
      const boardViewport = node.closest(".museum-board-world")?.parentElement?.getBoundingClientRect();
      // The transformed board plane is clipped by its viewport. Only pin
      // explanations whose anchor is actually on the visible part of it.
      const x = rect.right - (node.classList.contains("museum-paper") ? 2 : 8);
      const y = rect.bottom - (node.classList.contains("museum-paper") ? 2 : 8);
      if (x < 12 || y < 12 || x > innerWidth + 2 || y > innerHeight + 2 ||
          (boardViewport && (x < boardViewport.left || x > boardViewport.right || y < boardViewport.top || y > boardViewport.bottom))) continue;
      if (bounds.some(([bx, by]) => Math.hypot(x - bx, y - by) < 21)) continue;
      bounds.push([x, y]);
      visible.add(node);
    }
    for (const [node, help] of buttons) {
      if (visible.has(node)) continue;
      if (active === node) close();
      help.remove();
      buttons.delete(node);
    }
    let at = 0;
    for (const node of visible) {
      const [x, y] = bounds[at++];
      const help = buttons.get(node) || makeHelp(node);
      help.style.left = `${Math.min(innerWidth - 13, x)}px`;
      help.style.top = `${Math.min(innerHeight - 13, y)}px`;
      if (node === active) placePopover(help);
    }
  }

  pop.addEventListener("pointerenter", () => clearTimeout(timer));
  pop.addEventListener("pointerleave", planClose);
  pop.addEventListener("focusout", planClose);
  document.addEventListener("pointerdown", (event) => {
    if (event.target instanceof Element && !pop.contains(event.target) &&
        !event.target.closest(".museum-help-trigger")) close();
  }, { capture: true, signal });
  function escape(event) {
    if (event.key !== "Escape" || !active) return false;
    const trigger = buttons.get(active);
    close();
    suppressFocus = true;
    trigger?.focus({ preventScroll: true });
    suppressFocus = false;
    return true;
  }
  return { update, close, escape, switchNode };
}
