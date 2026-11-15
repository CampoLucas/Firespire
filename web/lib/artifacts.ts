// Lectura de artefactos apta para el navegador (sin `fs`). La variante de servidor
// vive en artifacts.server.ts. Firmas congeladas; la implementación es del paquete C.
import type {
  ArtifactSet,
  BlockName,
  Calibration,
  Cells,
  Latest,
  Meta,
  MonthlyData,
  Validation,
} from "./artifact-types";

export const ARTIFACTS_BASE = "/artifacts";

function findBlock(meta: Meta, name: BlockName, dtype: "uint8" | "uint16le", expected: number) {
  const b = meta.monthly.blocks.find((x) => x.name === name);
  if (!b) throw new Error(`monthly.bin: block '${name}' missing in meta`);
  if (b.dtype !== dtype) throw new Error(`monthly.bin: block '${name}' has dtype ${b.dtype}, expected ${dtype}`);
  if (b.length !== expected) {
    throw new Error(`monthly.bin: block '${name}' has ${b.length} elements, expected ${expected} (n_cells * n_months)`);
  }
  return b;
}

/** Parte monthly.bin en sus cuatro bloques usando meta.monthly.blocks (offsets en bytes). */
export function parseMonthly(buffer: ArrayBuffer, meta: Meta): MonthlyData {
  const nCells = meta.n_cells;
  const nMonths = meta.n_months;
  const expected = nCells * nMonths;
  if (buffer.byteLength < expected * 6) {
    throw new Error(`monthly.bin is ${buffer.byteLength} bytes, expected at least ${expected * 6}`);
  }
  const u8 = (name: BlockName): Uint8Array => {
    const b = findBlock(meta, name, "uint8", expected);
    if (b.offset < 0 || b.offset + b.length > buffer.byteLength) {
      throw new Error(`monthly.bin: block '${name}' exceeds the file size`);
    }
    return new Uint8Array(buffer, b.offset, b.length);
  };
  const u16 = (name: BlockName): Uint16Array => {
    const b = findBlock(meta, name, "uint16le", expected);
    if (b.offset < 0 || b.offset + b.length * 2 > buffer.byteLength) {
      throw new Error(`monthly.bin: block '${name}' exceeds the file size`);
    }
    // El offset puede ser impar: se copia el tramo (alineado) antes de crear el Uint16Array.
    // Se asume host little-endian, igual que el archivo.
    return new Uint16Array(buffer.slice(b.offset, b.offset + b.length * 2));
  };
  return {
    nCells,
    nMonths,
    celldaysModis: u8("celldays_modis"),
    celldaysViirs: u8("celldays_viirs"),
    hotspotsModis: u16("hotspots_modis"),
    hotspotsViirs: u16("hotspots_viirs"),
  };
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** Lee latest.json y los artefactos de esa versión por HTTP. */
export async function loadArtifactsFromUrl(base: string = ARTIFACTS_BASE): Promise<ArtifactSet> {
  const root = base.replace(/\/+$/, "");
  const latest = await getJson<Latest>(`${root}/latest.json`);
  const dir = `${root}/${latest.version}`;
  const [meta, cells, calibration, validation] = await Promise.all([
    getJson<Meta>(`${dir}/meta.json`),
    getJson<Cells>(`${dir}/cells.json`),
    getJson<Calibration>(`${dir}/calibration.json`),
    getJson<Validation>(`${dir}/validation.json`),
  ]);
  const res = await fetch(`${dir}/${meta.monthly.file}`);
  if (!res.ok) throw new Error(`Could not load ${dir}/${meta.monthly.file}: HTTP ${res.status}`);
  const monthly = parseMonthly(await res.arrayBuffer(), meta);
  return { meta, cells, calibration, validation, monthly };
}
