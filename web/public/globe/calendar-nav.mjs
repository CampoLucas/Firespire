// Aritmética de fechas del historial del globo (funciones puras, sin DOM).
// Un "día" es el índice dentro del año (0 = 1 de enero), igual que st.end / st.day en index.html.

export const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export const daysInYear = (y) => (isLeap(y) ? 366 : 365);
/** 0 = lunes … 6 = domingo. */
export const dayOfWeek = (y, d) => (new Date(Date.UTC(y, 0, 1 + d)).getUTCDay() + 6) % 7;
export const monthOfDay = (y, d) => new Date(Date.UTC(y, 0, 1 + d)).getUTCMonth();
/** Índice de año del día `dd` del mes `m` (0-11); admite m = 12 (1 de enero siguiente). */
export const dayOfYear = (y, m, dd) => Math.round((Date.UTC(y, m, dd) - Date.UTC(y, 0, 1)) / 864e5);

/** Año disponible más cercano en la dirección `dir` (-1 / +1), o null si no hay. */
export function adjacentYear(years, year, dir) {
  const sorted = [...years].sort((a, b) => a - b);
  return (dir < 0 ? sorted.reverse().find((y) => y < year) : sorted.find((y) => y > year)) ?? null;
}

/**
 * Paso del botón anterior/siguiente. `state` = { scale: "week"|"month"|"year", year, end, day }.
 * Devuelve el estado nuevo { year, end, day } o null si ya se está en el borde de los años disponibles.
 * - Con un día elegido se mueve de a un día (cruza meses y años) y el período lo sigue.
 * - Semana (lunes a domingo): la semana a caballo entre dos años se muestra recortada a cada año;
 *   al terminar un año se pasa a la primera semana del siguiente, sin saltear nada.
 * - Mes: diciembre y enero se encadenan entre años. Año: cambia de año conservando el día.
 */
export function stepPeriod(state, dir, years) {
  const { scale, year, end, day } = state;
  const nd = daysInYear(year);
  const other = adjacentYear(years, year, dir);
  const lastOf = (y) => daysInYear(y) - 1;

  if (day != null) {
    const to = day + dir;
    if (to >= 0 && to < nd) return { year, end: to, day: to };
    if (other == null) return null;
    const d = dir < 0 ? lastOf(other) : 0;
    return { year: other, end: d, day: d };
  }
  if (scale === "year") {
    if (other == null) return null;
    return { year: other, end: Math.min(end, lastOf(other)), day: null };
  }
  if (scale === "month") {
    const m = monthOfDay(year, end);
    if (dir < 0) {
      if (m > 0) return { year, end: dayOfYear(year, m - 1, 1), day: null };
      return other == null ? null : { year: other, end: dayOfYear(other, 11, 1), day: null };
    }
    if (m < 11) return { year, end: dayOfYear(year, m + 1, 1), day: null };
    return other == null ? null : { year: other, end: 0, day: null };
  }
  const monday = end - dayOfWeek(year, end);
  if (dir < 0) {
    if (monday > 0) return { year, end: monday - 1, day: null };
    return other == null ? null : { year: other, end: lastOf(other), day: null };
  }
  if (monday + 6 < nd - 1) return { year, end: monday + 7, day: null };
  return other == null ? null : { year: other, end: 0, day: null };
}
