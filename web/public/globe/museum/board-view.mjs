import { BOARD } from "./catalog.mjs";
import { annotate, button, element } from "./dom.mjs";
import { boardHelp, edgeHelp, itemHelp } from "./annotations.mjs";
import { cameraMatrix, focusPose, overviewPose } from "./board-camera.mjs";

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
  const paper = annotate(element("article", `museum-paper museum-paper--${item.kind}`),
    item.title, itemHelp(item));
  paper.dataset.item = item.id;
  Object.assign(paper.style, {
    left: `${x - width / 2}px`, top: `${y - height / 2}px`,
    width: `${width}px`, height: `${height}px`, transform: `rotate(${rotation}deg)`,
  });
  const type = element("p", "museum-paper-type", `${types[item.kind]} / fictional`);
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
  const source = annotate(element("footer", "museum-paper-source"),
    `Source for ${item.title}`, itemHelp(item, true));
  source.append(element("b", "", item.source.name), element("span", "", item.source.date));
  const hit = button("museum-paper-hit", "", () => select(item.id));
  hit.setAttribute("aria-label", `Examine ${item.title}`);
  const pin = element("i", "museum-pin");
  pin.setAttribute("aria-hidden", "true");
  paper.append(type, title, body, source, hit, pin);
  return { paper, hit, body };
}

export function createBoard(exhibit, actions) {
  const root = element("section", "museum-scene");
  root.setAttribute("aria-label", "Investigation board");
  const header = annotate(element("header", "museum-board-header"), "Investigation board", {
    ...boardHelp, role: `${boardHelp.role} ${exhibit.boardNote}`,
  });
  header.append(element("p", "museum-kicker", "Museum of Fires / Fictional exhibit"));
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
    const label = annotate(element("span", "museum-edge", edge.label), edge.label, edgeHelp(edge));
    Object.assign(label.style, { left: `${x}px`, top: `${y}px` });
    label.title = `Mock relationship. ${edge.basis}`;
    world.append(label);
  }
  if (!exhibit.items.length) world.append(element("p", "museum-empty", "This exhibit has no evidence records."));
  viewport.append(world);

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
  root.append(header, viewport, footer);

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
    whole.hidden = id == null;
    previous.hidden = next.hidden = id == null;
    const at = exhibit.items.findIndex((item) => item.id === id);
    previous.disabled = at <= 0;
    next.disabled = at >= exhibit.items.length - 1;
    for (const [itemID, { paper, hit, body }] of papers) {
      const focused = id === itemID;
      const readable = focused && settled;
      paper.classList.toggle("is-focused", focused);
      paper.classList.toggle("is-readable", readable);
      hit.hidden = focused;
      body.tabIndex = readable ? 0 : -1;
      body.inert = !readable;
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
      const item = exhibit.items.find((item) => item.id === id);
      return item ? focusPose(item.placement, width, height) : overviewPose(width, height);
    },
    setCamera(pose) {
      world.style.setProperty("--museum-scale", String(pose.scale));
      world.style.transform = `matrix(${cameraMatrix(pose, viewport.clientWidth, viewport.clientHeight).join(",")})`;
    },
  };
}
