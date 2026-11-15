// Utilidades compartidas por las rutas de API (sin dependencias de Next).
import { loadArtifactsFromFs } from "./artifacts.server";
import type { ArtifactSet } from "./artifact-types";

export function jsonError(error: string, status: number): Response {
  return Response.json({ error }, { status });
}

/** Carga los artefactos o devuelve 503 si faltan o no se pueden leer. */
export async function withArtifacts(
  handler: (a: ArtifactSet) => Response | Promise<Response>,
): Promise<Response> {
  let a: ArtifactSet;
  try {
    a = await loadArtifactsFromFs();
  } catch (e) {
    return jsonError((e as Error).message, 503);
  }
  return handler(a);
}
