import { connection } from "next/server";
import { withArtifacts } from "@/lib/api-helpers";

export async function GET(): Promise<Response> {
  // Sin parámetros de pedido: se fuerza tiempo de pedido para leer los artefactos de disco.
  await connection();
  return withArtifacts((a) =>
    Response.json({ version: a.meta.version, calibration: a.calibration, validation: a.validation }),
  );
}
