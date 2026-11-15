// Lectura de artefactos desde disco para las rutas de API (solo servidor).
// Firma congelada; la implementación es del paquete C.
import type { ArtifactSet } from "./artifact-types";

/** Lee public/artifacts/latest.json y los artefactos de esa versión con `fs`. */
export async function loadArtifactsFromFs(): Promise<ArtifactSet> {
  throw new Error("not implemented");
}
