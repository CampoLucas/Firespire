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

    f = sub.add_parser("fetch", help="bajar datos NRT o SP de la API de FIRMS")
    f.add_argument("--days", type=int, default=None,
                   help="días hacia atrás desde --end (default: 30)")
    f.add_argument("--start", type=date.fromisoformat, default=None,
                   help="primer día YYYY-MM-DD (reemplaza a --days; usar día 1 para meses completos)")
    f.add_argument("--end", type=date.fromisoformat, default=None,
                   help="último día YYYY-MM-DD (default: el último disponible)")
    f.add_argument("--product", choices=["nrt", "sp"], default="nrt",
                   help="nrt (tiempo casi real) o sp (procesamiento estándar); default: nrt")
    f.add_argument("--after-sp", action="store_true",
                   help="solo con --product nrt: arranca el día siguiente al corte del SP "
                        "(cada fuente desde el corte de su SP + 1 día; excluyente con --start y --days)")
    f.add_argument("--out", type=Path, default=None,
                   help="carpeta de salida (default: fuentes/nrt o fuentes/sp según el producto)")
    f.add_argument("--sources", default=None,
                   help="fuentes FIRMS separadas por coma (default: las cuatro del producto)")
    g = sub.add_parser("globe", help="generar web/public/globe/data/data-YYYY.js para el globo")
    g.add_argument("folders", nargs="+", type=Path, metavar="csv_folder")
    g.add_argument("--years", type=lambda s: [int(y) for y in s.split(",")], default=None,
                   help="solo estos años, separados por coma (default: todos los encontrados)")
    args = parser.parse_args(argv)
    if args.cmd == "build":
        build(args.folders, args.version, args.out)
    elif args.cmd == "globe":
        from firespire import globe

        globe.run(args.folders, only=args.years)
    else:
        available = fetch.sources_for(args.product)
        raw = args.sources if args.sources is not None else ",".join(available)
        sources = [s.strip() for s in raw.split(",") if s.strip()]
        unknown = set(sources) - set(available)
        if unknown:
            parser.error(f"fuentes desconocidas: {sorted(unknown)}")
        if args.after_sp and args.product != "nrt":
            parser.error("--after-sp solo vale con --product nrt")
        if args.after_sp and (args.start is not None or args.days is not None):
            parser.error("--after-sp es excluyente con --start y --days")
        out = args.out or (fetch.DEFAULT_OUT_SP if args.product == "sp" else fetch.DEFAULT_OUT)
        fetch.run(args.days or 30, args.end, out, sources, start=args.start,
                  product=args.product, after_sp=args.after_sp)


if __name__ == "__main__":
    main()
