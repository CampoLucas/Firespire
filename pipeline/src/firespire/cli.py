"""CLI: `firespire build <carpeta_csv>... [--version v0] [--out dir]`."""
from __future__ import annotations

import argparse
from datetime import date
from pathlib import Path

import duckdb

from firespire import calibrate, config, validate


def _count(con, table: str) -> int | str:
    try:
        return con.execute(f"SELECT count(*) FROM {table}").fetchone()[0]
    except duckdb.Error:
        return "?"


def build(folders: list[Path], version: str, out: Path) -> Path:
    # Los módulos de la etapa 1-5 los escribe otro paquete; se importan acá por nombre.
    from firespire import celldays, export, filters, ingest, mask

    con = duckdb.connect(":memory:")
    ingest.ingest(con, folders)
    print(f"ingest: detections={_count(con, 'detections')}")
    filters.apply(con)
    print(f"filters: detections_filtered={_count(con, 'detections_filtered')}")
    celldays.assign_cells(con)
    print(f"assign_cells: det_cells={_count(con, 'det_cells')}")
    mask.build(con)
    print(f"mask: masked_cells={_count(con, 'masked_cells')}")
    celldays.build(con)
    print(f"celldays: cell_days={_count(con, 'cell_days')}")
    cal = calibrate.compute(con)
    ks = ", ".join(f"{r['id']}={r['k'] if r['k'] is None else round(r['k'], 4)} ({r['method']})"
                   for r in cal["regimes"])
    print(f"calibrate: k per regime: {ks}")
    val = validate.compute(con)
    print(
        f"validate: holdout={val['holdout']['status']}, snpp_drop={val['snpp_drop']['status']}"
    )
    path = export.write(con, cal, val, out, version)
    print(f"export: wrote {path}")
    return path


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="firespire")
    sub = parser.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build", help="construir artefactos desde carpetas de CSV de FIRMS")
    b.add_argument("folders", nargs="+", type=Path, metavar="csv_folder")
    b.add_argument("--version", default="v0")
    b.add_argument("--out", type=Path, default=config.DEFAULT_OUT)
    from firespire import fetch

    f = sub.add_parser("fetch", help="bajar datos NRT recientes de la API de FIRMS")
    f.add_argument("--days", type=int, default=30, help="días hacia atrás desde --end")
    f.add_argument("--start", type=date.fromisoformat, default=None,
                   help="primer día YYYY-MM-DD (reemplaza a --days; usar día 1 para meses completos)")
    f.add_argument("--end", type=date.fromisoformat, default=None,
                   help="último día YYYY-MM-DD (default: el último disponible)")
    f.add_argument("--out", type=Path, default=fetch.DEFAULT_OUT)
    f.add_argument("--sources", default=",".join(fetch.SOURCES),
                   help="fuentes FIRMS separadas por coma")
    args = parser.parse_args(argv)
    if args.cmd == "build":
        build(args.folders, args.version, args.out)
    else:
        sources = [s.strip() for s in args.sources.split(",") if s.strip()]
        unknown = set(sources) - set(fetch.SOURCES)
        if unknown:
            parser.error(f"fuentes desconocidas: {sorted(unknown)}")
        fetch.run(args.days, args.end, args.out, sources, start=args.start)


if __name__ == "__main__":
    main()
