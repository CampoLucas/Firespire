import { describe, expect, it } from "vitest";
import { adjacentYear, dayOfWeek, daysInYear, stepPeriod } from "../../public/globe/calendar-nav.mjs";

const YEARS = Array.from({ length: 27 }, (_, i) => 2000 + i);
const doy = (y: number, m: number, d: number) => Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 864e5);
type S = { scale: "week" | "month" | "year"; year: number; end: number; day: number | null };
const step = (s: S, dir: number) => stepPeriod(s, dir, YEARS);

describe("calendar navigation across years", () => {
  it("knows leap years", () => {
    expect(daysInYear(2024)).toBe(366);
    expect(daysInYear(2025)).toBe(365);
    expect(daysInYear(2000)).toBe(366);
    expect(daysInYear(2100)).toBe(365);
  });

  it("finds adjacent available years, even with gaps", () => {
    expect(adjacentYear(YEARS, 2026, 1)).toBeNull();
    expect(adjacentYear(YEARS, 2000, -1)).toBeNull();
    expect(adjacentYear([2000, 2003], 2000, 1)).toBe(2003);
    expect(adjacentYear([2000, 2003], 2003, -1)).toBe(2000);
  });

  it("week: goes back from the first week of 2026 into the last week of 2025", () => {
    expect(step({ scale: "week", year: 2026, end: 0, day: null }, -1)).toEqual({ year: 2025, end: 364, day: null });
  });

  it("week: moves forward from the last week of 2025 into the first week of 2026", () => {
    expect(step({ scale: "week", year: 2025, end: 364, day: null }, 1)).toEqual({ year: 2026, end: 0, day: null });
  });

  it("week: steps whole Monday-Sunday weeks inside a year", () => {
    const from = { scale: "week", year: 2025, end: doy(2025, 6, 11), day: null } as S;
    const back = step(from, -1)!;
    expect(back.year).toBe(2025);
    expect(back.end).toBe(doy(2025, 6, 8));
    expect(dayOfWeek(2025, back.end)).toBe(6);
    const fwd = step(from, 1)!;
    expect(fwd.end).toBe(doy(2025, 6, 16));
    expect(dayOfWeek(2025, fwd.end)).toBe(0);
  });

  it("week: walking forward through 2025 never repeats a stop and reaches 2026", () => {
    let s: S = { scale: "week", year: 2025, end: 0, day: null };
    const seen = new Set<string>();
    let reached2026 = false;
    for (let i = 0; i < 70; i++) {
      const key = `${s.year}:${s.end}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
      const t = step(s, 1);
      expect(t).not.toBeNull();
      s = { ...s, year: t!.year, end: t!.end };
      if (s.year === 2026) {
        reached2026 = true;
        expect(s.end).toBe(0);
        break;
      }
    }
    expect(reached2026).toBe(true);
  });

  it("month: December <-> January across years", () => {
    expect(step({ scale: "month", year: 2025, end: doy(2025, 12, 15), day: null }, 1)).toEqual({ year: 2026, end: 0, day: null });
    expect(step({ scale: "month", year: 2026, end: doy(2026, 1, 20), day: null }, -1)).toEqual({
      year: 2025,
      end: doy(2025, 12, 1),
      day: null,
    });
    expect(step({ scale: "month", year: 2024, end: doy(2024, 2, 10), day: null }, 1)).toEqual({
      year: 2024,
      end: doy(2024, 3, 1),
      day: null,
    });
  });

  it("year: changes the year and keeps the day when it exists", () => {
    expect(step({ scale: "year", year: 2025, end: 100, day: null }, 1)).toEqual({ year: 2026, end: 100, day: null });
    expect(step({ scale: "year", year: 2026, end: 100, day: null }, -1)).toEqual({ year: 2025, end: 100, day: null });
    expect(step({ scale: "year", year: 2024, end: 365, day: null }, 1)).toEqual({ year: 2025, end: 364, day: null });
  });

  it("day: crosses month and year boundaries one day at a time and stays selected", () => {
    expect(step({ scale: "week", year: 2025, end: 364, day: 364 }, 1)).toEqual({ year: 2026, end: 0, day: 0 });
    expect(step({ scale: "month", year: 2026, end: 0, day: 0 }, -1)).toEqual({ year: 2025, end: 364, day: 364 });
    const jan31 = doy(2025, 1, 31);
    expect(step({ scale: "week", year: 2025, end: jan31, day: jan31 }, 1)).toEqual({
      year: 2025,
      end: doy(2025, 2, 1),
      day: doy(2025, 2, 1),
    });
  });

  it("day: handles 29 February in a leap year and the 2024/2025 boundary", () => {
    const feb28 = doy(2024, 2, 28);
    const feb29 = step({ scale: "week", year: 2024, end: feb28, day: feb28 }, 1)!;
    expect(feb29.day).toBe(doy(2024, 2, 29));
    expect(step({ scale: "week", year: 2024, end: feb29.day!, day: feb29.day }, 1)!.day).toBe(doy(2024, 3, 1));
    expect(step({ scale: "week", year: 2024, end: 365, day: 365 }, 1)).toEqual({ year: 2025, end: 0, day: 0 });
    expect(step({ scale: "week", year: 2025, end: 0, day: 0 }, -1)).toEqual({ year: 2024, end: 365, day: 365 });
  });

  it("stops only at the first period of 2000 and the last of 2026", () => {
    for (const scale of ["week", "month", "year"] as const) {
      expect(step({ scale, year: 2000, end: 0, day: null }, -1)).toBeNull();
      expect(step({ scale, year: 2026, end: 364, day: null }, 1)).toBeNull();
    }
    expect(step({ scale: "week", year: 2000, end: 0, day: 0 }, -1)).toBeNull();
    expect(step({ scale: "week", year: 2026, end: 364, day: 364 }, 1)).toBeNull();
    expect(step({ scale: "week", year: 2000, end: 0, day: null }, 1)).not.toBeNull();
    expect(step({ scale: "week", year: 2026, end: 364, day: null }, -1)).not.toBeNull();
    expect(step({ scale: "year", year: 2026, end: 10, day: null }, -1)).not.toBeNull();
    expect(step({ scale: "month", year: 2000, end: doy(2000, 2, 1), day: null }, -1)).not.toBeNull();
  });
});
