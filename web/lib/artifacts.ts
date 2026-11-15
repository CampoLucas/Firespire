// Lectura de artefactos apta para el navegador (sin `fs`). La variante de servidor
// vive en artifacts.server.ts. Firmas congeladas; la implementación es del paquete C.
import type { ArtifactSet, Meta, MonthlyData } from "./artifact-types";

export const ARTIFACTS_BASE = "/artifacts";

/** Parte monthly.bin en sus cuatro bloques usando meta.monthly.blocks (offsets en bytes). */
export function parseMonthly(buffer: ArrayBuffer, meta: Meta): MonthlyData {
  throw new Error("not implemented");
}

/** Lee latest.json y los artefactos de esa versión por HTTP. */
export async function loadArtifactsFromUrl(base: string = ARTIFACTS_BASE): Promise<ArtifactSet> {
  throw new Error("not implemented");
}
