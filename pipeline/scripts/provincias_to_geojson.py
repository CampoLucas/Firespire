"""Convierte web/public/globe/data/provincias.js a un FeatureCollection GeoJSON.

Entrada: window.PROVINCIAS=[...]; (una sola línea, coordenadas [lon, lat]).
Salida:  pipeline/resources/provincias.geojson, una Feature por provincia,
         ordenadas por nombre, con properties = {"name": ...}.
"""

import json
from pathlib import Path

# Rutas relativas a este script, así funciona desde cualquier cwd.
PIPELINE_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = PIPELINE_DIR.parent
ENTRADA = REPO_DIR / "web" / "public" / "globe" / "data" / "provincias.js"
SALIDA = PIPELINE_DIR / "resources" / "provincias.geojson"

PREFIJO = "window.PROVINCIAS="


def main() -> None:
    texto = ENTRADA.read_text(encoding="utf-8").strip()
    # Quitamos el prefijo JS y el ';' final para quedarnos con el JSON puro.
    if not texto.startswith(PREFIJO):
        raise ValueError(f"No empieza con '{PREFIJO}': {ENTRADA}")
    texto = texto.removesuffix(";")
    provincias = json.loads(texto[len(PREFIJO):])

    # Una Feature por provincia, con la geometría tal cual viene.
    features = [
        {
            "type": "Feature",
            "properties": {"name": p["name"]},
            "geometry": p["geo"],
        }
        for p in sorted(provincias, key=lambda p: p["name"])
    ]
    coleccion = {"type": "FeatureCollection", "features": features}

    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    with SALIDA.open("w", encoding="utf-8", newline="\n") as f:
        json.dump(coleccion, f, separators=(",", ":"), ensure_ascii=False)

    print(f"{len(features)} features -> {SALIDA}")


if __name__ == "__main__":
    main()
