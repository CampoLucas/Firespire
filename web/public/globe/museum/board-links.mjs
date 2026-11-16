import { isHttpsUrl } from "./curated-validate.mjs";

/** Connects only documentary identities or explicit references, never shared locations or pipeline files. */
export function sharedSourceEdges(items) {
  const documentary = new Set(items.filter((item) => item.link && typeof item.source?.id === "string" && item.source.id.length > 0 && isHttpsUrl(item.source.url)).map((item) => item.source.id));
  const groups = new Map();
  for (const item of items) {
    const refs = new Set(item.sourceRefs ?? []);
    if (item.link && isHttpsUrl(item.source?.url)) refs.add(item.source.id);
    for (const id of refs) {
      if (!documentary.has(id)) continue;
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push(item.id);
    }
  }
  const edges = [];
  for (const [sourceId, ids] of groups) {
    for (let i = 1; i < ids.length; i++) edges.push({ from: ids[0], to: ids[i], label: "Shared documentary source", sourceId });
  }
  return edges;
}
