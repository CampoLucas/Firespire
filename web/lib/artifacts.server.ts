// Lectura de artefactos desde disco para las rutas de API (solo servidor).
// Firma congelada; la implementación es del paquete C.
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ArtifactSet, Calibration, Cells, Latest, Meta, Validation } from "./artifact-types";
import { parseMonthly } from "./artifacts";

/** Los artefactos no existen o no se pueden leer (la API responde 503). */
export class ArtifactsMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArtifactsMissingError";
  }
}

let cached: Promise<ArtifactSet> | null = null;

async function readJson<T>(file: string): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (e) {
    throw new ArtifactsMissingError(`Artifact file not available: ${path.basename(file)} (${(e as Error).message})`);
  }
}

async function load(): Promise<ArtifactSet> {
  const root = path.join(process.cwd(), "public", "artifacts");
  const latest = await readJson<Latest>(path.join(root, "latest.json"));
  const dir = path.join(root, latest.version);
  const [meta, cells, calibration, validation] = await Promise.all([
    readJson<Meta>(path.join(dir, "meta.json")),
    readJson<Cells>(path.join(dir, "cells.json")),
    readJson<Calibration>(path.join(dir, "calibration.json")),
    readJson<Validation>(path.join(dir, "validation.json")),
  ]);
  let buf: Buffer;
  try {
    buf = await readFile(path.join(dir, meta.monthly.file));
  } catch (e) {
    throw new ArtifactsMissingError(`Artifact file not available: ${meta.monthly.file} (${(e as Error).message})`);
  }
  // Buffer puede ser un tramo de un pool: se copia al ArrayBuffer exacto.
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  return { meta, cells, calibration, validation, monthly: parseMonthly(ab, meta) };
}

/** Lee public/artifacts/latest.json y los artefactos de esa versión con `fs`. */
export async function loadArtifactsFromFs(): Promise<ArtifactSet> {
  if (!cached) {
    const p = load();
    cached = p;
    // No se cachean los fallos: el próximo pedido reintenta.
    p.catch(() => {
      if (cached === p) cached = null;
    });
  }
  return cached;
}
