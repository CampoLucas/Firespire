import { afterEach, describe, expect, it, vi } from "vitest";
import { createReadiness, startCountdown } from "../../public/globe/museum/readiness.mjs";
import { panPose, zoomPose, constrainPose } from "../../public/globe/museum/board-navigation.mjs";
import { sharedSourceEdges } from "../../public/globe/museum/board-links.mjs";
import { initial, reduce, Stage } from "../../public/globe/museum/state.mjs";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("actual startup readiness", () => {
  it("waits for every required resource and does not turn a failure into ready", () => {
    const ready = createReadiness(["earth", "activity", "museum"]);
    ready.complete("earth");
    ready.complete("activity");
    expect(ready.status).toBe("loading");
    ready.fail(new Error("Museum unavailable"));
    ready.complete("museum");
    expect(ready.status).toBe("error");
    expect(ready.error).toBe("Museum unavailable");
  });
  it("becomes ready only after the final successful resource", () => {
    const ready = createReadiness(["earth", "activity"]);
    ready.complete("activity");
    expect(ready.status).toBe("loading");
    ready.complete("earth");
    expect(ready.status).toBe("ready");
  });
});

describe("visible preview countdown", () => {
  it("enters once after fifteen seconds and can be cancelled by manual start", () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 16));
    vi.stubGlobal("cancelAnimationFrame", clearTimeout);
    const enter = vi.fn();
    const cancel = startCountdown(15000, vi.fn(), enter);
    vi.advanceTimersByTime(14999);
    expect(enter).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(enter).toHaveBeenCalledTimes(1);
    cancel();
    const second = startCountdown(15000, vi.fn(), enter);
    vi.advanceTimersByTime(7000);
    second();
    vi.advanceTimersByTime(16000);
    expect(enter).toHaveBeenCalledTimes(1);
  });
});

describe("one board coordinate system", () => {
  it("pans in world units and keeps the zoom anchor fixed", () => {
    const view = { x: 800, y: 500, scale: .5, roll: 0 };
    expect(panPose(view, 100, 50)).toEqual({ x: 600, y: 400, scale: .5, roll: 0 });
    const zoomed = zoomPose(view, 2, 100, 40);
    expect(zoomed).toEqual({ x: 900, y: 540, scale: 1, roll: 0 });
    expect((1000 - zoomed.x) * zoomed.scale).toBe(100);
  });
  it("bounds invalid or extreme input instead of producing giant transforms", () => {
    const pose = constrainPose({ x: -104458, y: -35698, scale: Infinity, roll: NaN }, 1600, 1000, .5);
    expect(pose.x).toBeGreaterThanOrEqual(-400);
    expect(pose.y).toBeGreaterThanOrEqual(-250);
    expect(Number.isFinite(pose.scale)).toBe(true);
    expect(Number.isFinite(pose.roll)).toBe(true);
  });
  it("manual movement cancels stale focus animation completion", () => {
    const board = reduce(reduce(reduce(initial(), { type: "select" }), { type: "start" }), { type: "board" });
    const moving = reduce(board, { type: "focus", id: "evidence" }, ["evidence"]);
    const manual = reduce(moving, { type: "navigate" });
    expect(manual.stage).toBe(Stage.evidence);
    expect(manual.motion).toBeGreaterThan(moving.motion);
    expect(reduce(manual, { type: "settle", motion: moving.motion })).toBe(manual);
  });
});

describe("verified documentary source links", () => {
  it("connects recorded references, not proximity or shared generated artifacts", () => {
    const items = [
      { id: "overview", sourceRefs: ["press-a"], source: { id: "artifact", url: "/artifacts/museum.json" } },
      { id: "article", link: true, source: { id: "press-a", url: "https://example.org/a" } },
      { id: "other", link: true, source: { id: "press-b", url: "https://example.org/b" } },
      { id: "satellite", source: { id: "artifact", url: "/artifacts/museum.json" } },
    ];
    expect(sharedSourceEdges(items)).toEqual([{ from: "overview", to: "article", label: "Shared documentary source", sourceId: "press-a" }]);
  });
  it("does not treat missing source identities as proof of a shared source", () => {
    expect(sharedSourceEdges([
      { id: "a", link: true, source: { url: "https://example.org/a" } },
      { id: "b", link: true, source: { url: "https://example.org/b" } },
    ])).toEqual([]);
  });
});
