import { BOARD } from "./catalog.mjs";
import { button, element } from "./dom.mjs";
import { renderBlocks } from "./blocks.mjs";
import { isHttpsUrl } from "./curated-validate.mjs";
import { cameraMatrix, focusPose, overviewPose } from "./board-camera.mjs";
import { layoutEvidence } from "./board-layout.mjs";

const types = { article: "Press clipping", report: "Field report", photo: "Image attachment", satellite: "Satellite sample" };

function svg(tag, attrs) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  return node;
}

function pinPosition({ placement: { x, y, height, rotation } }) {
  const radians = rotation * Math.PI / 180;
  const offset = height / 2 - 12;
  return [x + Math.sin(radians) * offset, y - Math.cos(radians) * offset];
}

function renderEvidence(item, select) {
  const { x, y, width, height, rotation } = item.placement;
  const paper = element("article", `museum-paper museum-paper--${item.kind}${item.isMock ? "" : " museum-paper--curated"}`);
  paper.dataset.item = item.id;
  Object.assign(paper.style, {
    left: `${x - width / 2}px`, top: `${y - height / 2}px`,
    width: `${width}px`, height: `${height}px`, transform: `rotate(${rotation}deg)`,
  });
  const type = element("p", "museum-paper-type", item.isMock ? `${types[item.kind]} / fictional` : item.typeLabel);
  const title = element("h3", "", item.title);
  const body = element("div", "museum-paper-body");
  body.tabIndex = -1;
  body.setAttribute("aria-label", item.title);
  if (item.image) {
    const figure = element("figure", "museum-figure");
    const image = element("img");
    image.src = new URL(`./assets/${item.image}`, import.meta.url).href;
    image.alt = item.alt;
    image.draggable = false;
    const fallback = element("span", "museum-image-fallback", item.alt);
    fallback.hidden = true;
    image.addEventListener("error", () => {
      image.hidden = true;
      fallback.hidden = false;
    });
    figure.append(image, fallback);
    if (item.caption) figure.append(element("figcaption", "", item.caption));
    body.append(figure);
  }
  if (item.fields) {
    const fields = element("dl", "museum-observation");
    for (const [key, value] of item.fields) fields.append(element("dt", "", key), element("dd", "", value));
    body.append(fields);
  }
  for (const paragraph of item.body ?? []) body.append(element("p", "", paragraph));
  if (item.blocks) renderBlocks(body, item.blocks);
  const source = element("footer", "museum-paper-source");
  source.append(element("b", "", item.source.name), element("span", "", item.source.date));
  // Enlace a la fuente original: solo https, y sus eventos no deben seleccionar ni deslizar la tarjeta.
  let link = null;
  if (item.link && isHttpsUrl(item.source.url)) {
    link = element("a", "museum-source-link", "Open original source");
    link.href = item.source.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.tabIndex = -1;
    for (const type of ["pointerdown", "pointerup", "click", "keydown"]) {
      link.addEventListener(type, (event) => event.stopPropagation());
    }
    source.append(link);
  }
  const hit = button("museum-paper-hit", "", () => select(item.id));
  hit.setAttribute("aria-label", `Examine ${item.title}`);
  const pin = element("i", "museum-pin");
  pin.setAttribute("aria-hidden", "true");
  paper.append(type, title, body, source, hit, pin);
  return { paper, hit, body, link };
}

export function createBoard(exhibit, actions) {
  const root = element("section", "museum-scene");
  root.setAttribute("aria-label", "Investigation board");
  root.dataset.boardView = "whiteboard";
  const header = element("header", "museum-board-header");
  header.append(element("p", "museum-kicker", exhibit.isMock
    ? "Museum of Fires / Fictional exhibit" : "Museum of Fires / Curated event · satellite overlap, not attribution"));
  const title = element("h2", "", exhibit.title);
  title.tabIndex = -1;
  header.append(title, element("p", "museum-board-location", `${exhibit.region} · ${exhibit.period}`));
  const viewport = element("div", "museum-board-viewport");
  const world = element("div", "museum-board-world");
  world.style.width = `${BOARD.width}px`;
  world.style.height = `${BOARD.height}px`;
  const strings = svg("svg", { class: "museum-strings", viewBox: `0 0 ${BOARD.width} ${BOARD.height}`, "aria-hidden": "true" });
  world.append(strings);
  const papers = new Map();
  for (const item of exhibit.items) {
    const record = renderEvidence(item, actions.select);
    papers.set(item.id, record);
    world.append(record.paper);
  }
  for (const edge of exhibit.edges) {
    const a = pinPosition(exhibit.items.find(({ id }) => id === edge.from));
    const b = pinPosition(exhibit.items.find(({ id }) => id === edge.to));
    const [x, y] = edge.via;
    const guides = edge.guides ?? [
      [a[0] + (x - a[0]) * .42, y + 26],
      [b[0] + (x - b[0]) * .42, y + 26],
    ];
    const d = `M ${a.join(" ")} Q ${guides[0].join(" ")} ${x} ${y} Q ${guides[1].join(" ")} ${b.join(" ")}`;
    strings.append(svg("path", { d }));
    const label = element("span", "museum-edge", edge.label);
    Object.assign(label.style, { left: `${x}px`, top: `${y}px` });
    label.title = `Mock relationship. ${edge.basis}`;
    world.append(label);
  }
  if (!exhibit.items.length) world.append(element("p", "museum-empty", "This exhibit has no evidence records."));
  const canvas = element("div", "museum-board-canvas");
  canvas.append(world);
  viewport.append(canvas);

  const tabs = element("div", "museum-board-tabs");
  tabs.setAttribute("role", "group");
  tabs.setAttribute("aria-label", "Investigation view");
  const whiteboard = button("", "Whiteboard", () => showView("whiteboard"));
  const evidence = button("", "Evidence", () => showView("evidence"));
  tabs.append(whiteboard, evidence);
  const list = element("div", "museum-evidence-list");
  list.setAttribute("aria-label", "Documentary evidence");
  for (const item of exhibit.items) {
    const choice = button("", item.title, () => {
      showView("whiteboard");
      actions.select(item.id);
    });
    choice.dataset.evidence = item.id;
    choice.append(element("small", "", item.isMock ? "Fictional exhibit" : item.typeLabel));
    list.append(choice);
  }
  function showView(view) {
    root.dataset.boardView = view;
    whiteboard.setAttribute("aria-pressed", String(view === "whiteboard"));
    evidence.setAttribute("aria-pressed", String(view === "evidence"));
    list.hidden = view !== "evidence";
    viewport.inert = view === "evidence";
  }
  showView("whiteboard");

  const footer = element("footer", "museum-board-footer");
  const note = element("p", "museum-board-note", exhibit.boardNote);
  const controls = element("div", "museum-board-controls");
  const whole = button("", "Whole board", actions.overview);
  const previous = button("", "←", () => actions.step(-1));
  previous.setAttribute("aria-label", "Previous evidence");
  const next = button("", "→", () => actions.step(1));
  next.setAttribute("aria-label", "Next evidence");
  const index = element("select", "museum-index");
  index.setAttribute("aria-label", "Choose evidence");
  const prompt = element("option", "", "Choose evidence");
  prompt.value = "";
  index.append(prompt);
  for (const item of exhibit.items) {
    const option = element("option", "", item.title);
    option.value = item.id;
    index.append(option);
  }
  index.addEventListener("change", () => index.value ? actions.select(index.value) : actions.overview());
  controls.append(whole, previous, index, next);
  footer.append(note, controls);
  root.append(header, tabs, viewport, list, footer);

  let swipe;
  viewport.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" || !index.value) return;
    swipe = { x: event.clientX, y: event.clientY, pointer: event.pointerId };
  });
  viewport.addEventListener("pointercancel", () => { swipe = null; });
  viewport.addEventListener("pointerup", (event) => {
    if (!swipe || swipe.pointer !== event.pointerId) return;
    const dx = event.clientX - swipe.x;
    const dy = event.clientY - swipe.y;
    swipe = null;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) actions.step(dx < 0 ? 1 : -1);
  });

  function mark(id, settled = false) {
    index.value = id ?? "";
    root.dataset.focused = String(id != null);
    viewport.scrollTop = 0;
    whole.hidden = id == null;
    previous.hidden = next.hidden = id == null;
    const at = exhibit.items.findIndex((item) => item.id === id);
    previous.disabled = at <= 0;
    next.disabled = at >= exhibit.items.length - 1;
    for (const [itemID, { paper, hit, body, link }] of papers) {
      const focused = id === itemID;
      const readable = focused && settled;
      paper.classList.toggle("is-focused", focused);
      paper.classList.toggle("is-readable", readable);
      hit.hidden = focused;
      body.tabIndex = readable ? 0 : -1;
      body.inert = !readable;
      if (link) link.tabIndex = readable ? 0 : -1;
    }
  }

  mark(null);
  return {
    root, title, index, viewport,
    focusEvidence(id) { papers.get(id)?.body.focus({ preventScroll: true }); },
    mark,
    pose(id = null) {
      const width = viewport.clientWidth;
      const height = viewport.clientHeight;
      const compact = matchMedia("(max-width: 699px)").matches;
      if (!compact && root.dataset.boardView === "evidence") showView("whiteboard");
      const layout = layoutEvidence(exhibit.items, compact);
      world.style.width = `${layout.width}px`;
      world.style.height = `${layout.height}px`;
      for (const item of layout.items) {
        const { x, y, width: w, height: h, rotation } = item.placement;
        Object.assign(papers.get(item.id).paper.style, {
          left: `${x - w / 2}px`, top: `${y - h / 2}px`, width: `${w}px`, height: `${h}px`, transform: `rotate(${rotation}deg)`,
        });
      }
      strings.setAttribute("viewBox", `0 0 ${layout.width} ${layout.height}`);
      const labels = world.querySelectorAll(".museum-edge");
      exhibit.edges.forEach((edge, index) => {
        const a = pinPosition(layout.items.find((item) => item.id === edge.from));
        const b = pinPosition(layout.items.find((item) => item.id === edge.to));
        const [x, y] = compact ? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] : edge.via;
        const guides = !compact && edge.guides ? edge.guides : [[a[0], y], [b[0], y]];
        strings.children[index].setAttribute("d", `M ${a.join(" ")} Q ${guides[0].join(" ")} ${x} ${y} Q ${guides[1].join(" ")} ${b.join(" ")}`);
        Object.assign(labels[index].style, { left: `${x}px`, top: `${y}px` });
      });
      const item = layout.items.find((item) => item.id === id);
      if (item) return focusPose(item.placement, width, height);
      if (!compact) return overviewPose(width, height);
      const scale = Math.max(.01, (width - 16) / layout.width);
      return { x: layout.width / 2, y: height / (2 * scale) - 16, scale, roll: 0 };
    },
    setCamera(pose) {
      world.style.setProperty("--museum-scale", String(pose.scale));
      world.style.transform = `matrix(${cameraMatrix(pose, viewport.clientWidth, viewport.clientHeight).join(",")})`;
      canvas.style.height = !index.value && matchMedia("(max-width: 699px)").matches
        ? `${parseFloat(world.style.height) * pose.scale + 24}px` : "100%";
    },
  };
}
