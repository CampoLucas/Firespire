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
# k de un régimen se calcula solo con meses SP donde VIIRS observó todos los satélites que el
# régimen espera (si no, k queda sesgado hacia la constelación parcial). Si ningún mes cumple,
# se usan los incompletos y el método queda marcado como "direct_incomplete". False = todos.
CALIBRATION_REQUIRE_ALL_SATELLITES = True
# D-06: k por régimen Y por mes calendario. El cociente MODIS/VIIRS varía 1,5-1,8x entre meses
# del año dentro de un mismo régimen (mínimo may-jun, máximo ago-sep); un k único deja ~20-25 %
# de error mensual. False = un solo k por régimen (calibration.json: k_granularity "regime").
CALIBRATION_K_BY_CALENDAR_MONTH = True
# Mínimo de meses de calibración del mismo mes calendario para fiarse de su k propio; con menos
# queda null y se usa el k del régimen.
CALIBRATION_MIN_MONTHS_PER_CALENDAR_MONTH = 2


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


# --- Museo de incendios (C1 candidatos, C4 cruce con FIRMS; docs/arquitechture-decitions/04) ---
# Radio por defecto (km) del área de interés (AOI) alrededor de lat/lon de un evento curado.
MUSEUM_AOI_KM = 25
# Radio máximo (km): eventos de provincia completa con ubicación `satellite_centroid`.
MUSEUM_AOI_MAX_KM = 60
# Días que se agregan antes del inicio y después del fin documentados al armar la ventana.
MUSEUM_WINDOW_PAD_DAYS = 3
# Celda-días armonizados mínimos en AOI y ventana para el veredicto "overlap" (1 a MIN-1 = "weak").
MUSEUM_MIN_CELLDAYS = 5
# Tope de puntos crudos en `sample` de museum.json (muestreo estratificado por día).
MUSEUM_MAX_POINTS = 1500
# Eventos curados (versionado) y salida de candidatos (no versionada, no es un artefacto).
MUSEUM_EVENTS = REPO_ROOT / "pipeline" / "resources" / "museum" / "events.json"
CANDIDATES_OUT = REPO_ROOT / "pipeline" / "out" / "candidates.json"
# Candidatos (C1): una provincia-mes entra al ranking solo con al menos estos celda-días
# armonizados en el mes (descarta ruido de meses chicos).
MUSEUM_MIN_MONTH_CELLDAYS = 150
# Mínimo de otros años con datos para fiarse de la mediana del mismo mes calendario.
MUSEUM_MIN_BASELINE_YEARS = 5
# Ventana móvil (días) donde se busca el episodio dentro de una provincia-mes.
MUSEUM_EPISODE_DAYS = 7
