"""Parámetros del método. Es la única fuente de umbrales, fechas y rutas del pipeline.

El contrato completo (tablas y artefactos) está en docs/contratos.md.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_OUT = REPO_ROOT / "web" / "public" / "artifacts"
PROVINCES_GEOJSON = REPO_ROOT / "pipeline" / "resources" / "provincias.geojson"

SCHEMA_VERSION = 1

# --- Grilla ---
H3_RES = 5  # celda-día y publicación (D-04)
MASK_RES = 5  # resolución de la máscara de fuentes persistentes

# --- Filtros ---
VEGETATION_TYPE = 0  # `type` de FIRMS: 0 vegetación, 1 volcán, 2 estática, 3 mar
MODIS_MIN_CONFIDENCE = 30  # supuesto (D-07)
VIIRS_DROP_CONFIDENCE = ("l",)

# --- Máscara de fuentes persistentes ---
MASK_MIN_DAYS = 90  # días con datos necesarios para evaluar una celda
MASK_FRACTION = 0.5  # se enmascara si hubo detección en más de esta fracción de días

# --- Satélites ---
MODIS = "MODIS"
VIIRS = "VIIRS"
# Nombre de archivo FIRMS -> satélite normalizado. `modis` trae Terra/Aqua en la columna
# `satellite`; para VIIRS manda el nombre de archivo (viirs-<clave>_YYYY_<País>.csv).
VIIRS_FILE_SATELLITE = {"snpp": "SNPP", "jpss1": "N20", "jpss2": "N21"}
# Valores de la columna `satellite` -> satélite normalizado.
SATELLITE_ALIASES = {
    "Terra": "Terra", "T": "Terra",
    "Aqua": "Aqua", "A": "Aqua",
    "N": "SNPP", "SNPP": "SNPP",
    "N20": "N20", "1": "N20",
    "N21": "N21", "2": "N21",
}

# --- Armonización ---
# Escala MODIS: MODIS hasta ene-2012 inclusive; k × VIIRS desde este mes.
HARMONIZED_START = "2012-02"


@dataclass(frozen=True)
class Regime:
    id: str
    satellites: tuple[str, ...]
    start: date


# Un mes pertenece al último régimen cuyo `start` es <= el día 1 de ese mes.
REGIMES: tuple[Regime, ...] = (
    Regime("V1", ("SNPP",), date(2012, 1, 20)),
    Regime("V2", ("SNPP", "N20"), date(2018, 4, 1)),
    Regime("V3", ("SNPP", "N20", "N21"), date(2023, 3, 1)),  # D-05 abierta: o 2024-01-17
    Regime("V4", ("N20", "N21"), date(2026, 11, 3)),
)


def regime_for_month(month: str) -> Regime | None:
    """Régimen VIIRS de un mes 'YYYY-MM', o None si es anterior a V1."""
    first = date(int(month[:4]), int(month[5:7]), 1)
    current = None
    for r in REGIMES:
        if r.start <= first:
            current = r
    return current
