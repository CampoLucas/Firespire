import { element } from "./dom.mjs";

function svg(tag, attrs = {}) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

/** Gráfico de líneas en SVG inline: solo atributos y textContent, nunca innerHTML. */
function renderChart(block) {
  const W = 320, H = 176, left = 34, right = 8, top = 8, bottom = 24;
  const wrap = element("figure", "museum-chart");
  const chart = svg("svg", { class: "museum-chart-svg", viewBox: `0 0 ${W} ${H}`, role: "img" });
  const all = block.series.flatMap(({ values }) => values).filter((v) => Number.isFinite(v));
  const peak = Math.max(1, ...all);
  const n = block.dates.length;
  chart.setAttribute("aria-label", n
    ? `${block.label}, ${block.dates[0]} to ${block.dates[n - 1]}, peak ${peak} cell-days per day`
    : `${block.label}, no daily values`);
  const xAt = (i) => n < 2 ? (left + W - right) / 2 : left + (i / (n - 1)) * (W - left - right);
  const yAt = (v) => top + (1 - v / peak) * (H - top - bottom);
  for (const value of [0, peak]) {
    chart.append(svg("line", { class: "museum-chart-grid", x1: left, x2: W - right, y1: yAt(value), y2: yAt(value) }));
    const tick = svg("text", { class: "museum-chart-tick", x: left - 4, y: yAt(value) + 4, "text-anchor": "end" });
    tick.textContent = String(Math.round(value * 10) / 10);
    chart.append(tick);
  }
  if (n) {
    const ends = n === 1 ? [[0, "start"]] : [[0, "start"], [n - 1, "end"]];
    for (const [i, anchor] of ends) {
      const tick = svg("text", { class: "museum-chart-tick", x: i === 0 ? left : W - right, y: H - 6, "text-anchor": anchor });
      tick.textContent = block.dates[i];
      chart.append(tick);
    }
  }
  for (const series of block.series) {
    let path = "";
    let pen = false;
    series.values.forEach((v, i) => {
      if (!Number.isFinite(v)) { pen = false; return; }
      path += `${pen ? "L" : "M"}${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)} `;
      pen = true;
    });
    if (path) chart.append(svg("path", { class: `museum-line museum-line--${series.key}`, d: path.trim() }));
  }
  const legend = element("ul", "museum-legend");
  for (const series of block.series) {
    const entry = element("li");
    const swatch = element("i", `museum-swatch museum-swatch--${series.key}`);
    swatch.setAttribute("aria-hidden", "true");
    entry.append(swatch, document.createTextNode(`${series.label} (cell-days per day)`));
    legend.append(entry);
  }
  wrap.append(chart, legend);
  return wrap;
}

/** Vuelca los bloques de una tarjeta curada en el cuerpo del papel. */
export function renderBlocks(body, blocks) {
  for (const block of blocks) {
    if (block.t === "p") body.append(element("p", "", block.text));
    else if (block.t === "quote") body.append(element("blockquote", "museum-quote", block.text));
    else if (block.t === "fields") {
      const list = element("dl", "museum-observation");
      for (const [key, value] of block.rows) list.append(element("dt", "", key), element("dd", "", value));
      body.append(list);
    } else if (block.t === "chart") body.append(renderChart(block));
  }
}
