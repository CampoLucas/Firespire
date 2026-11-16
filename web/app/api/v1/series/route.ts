import { withArtifacts, jsonError } from "@/lib/api-helpers";
import { parseSeriesParams } from "@/lib/csv";
import { monthlySeries } from "@/lib/harmonize";

// Lee request.url: se resuelve en tiempo de pedido (no se prerenderiza).
export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  return withArtifacts((a) => {
    const p = parseSeriesParams(params, a);
    if (!p.ok) return jsonError(p.error, 400);
    const points = monthlySeries(a, { source: p.source, province: p.province, from: p.from, to: p.to });
    return Response.json({ version: a.meta.version, source: p.source, province: p.provinceName, points });
  });
}
