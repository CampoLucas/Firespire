import { withArtifacts, jsonError } from "@/lib/api-helpers";
import { buildCsv, exportFilename, parseExportParams } from "@/lib/csv";

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  return withArtifacts((a) => {
    const p = parseExportParams(params, a);
    if (!p.ok) return jsonError(p.error, 400);
    const csv = buildCsv(a, p);
    if (csv === null) {
      return jsonError("Response too large (over 4 MB): narrow the province or the date range", 413);
    }
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exportFilename(p)}"`,
      },
    });
  });
}
