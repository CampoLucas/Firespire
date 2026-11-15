"""Tests sin red de las partes puras de fetch."""
from datetime import date

import pytest

from firespire import fetch, ingest


def test_chunks_cover_range_without_gaps():
    cs = fetch.chunks(date(2026, 10, 1), date(2026, 10, 12))
    assert cs == [(date(2026, 10, 1), 5), (date(2026, 10, 6), 5), (date(2026, 10, 11), 2)]
    assert fetch.chunks(date(2026, 10, 1), date(2026, 10, 1)) == [(date(2026, 10, 1), 1)]


def test_output_names_are_discovered_by_ingest(tmp_path):
    expected = {"MODIS_NRT": (None, "MODIS"), "VIIRS_SNPP_NRT": ("SNPP", "VIIRS"),
                "VIIRS_NOAA20_NRT": ("N20", "VIIRS"), "VIIRS_NOAA21_NRT": ("N21", "VIIRS")}
    for source in fetch.SOURCES:
        (tmp_path / fetch.output_name(source, 2026)).write_text("latitude\n")
    found = {(f.satellite, f.family) for f in ingest.discover([tmp_path])}
    assert found == set(expected.values())


def test_load_key_prefers_env_then_file(tmp_path, monkeypatch):
    env = tmp_path / ".env.local"
    env.write_text('OTHER=1\nFIRMS_MAP_KEY="abc123"\n')
    monkeypatch.setattr(fetch, "ENV_FILE", env)
    monkeypatch.delenv("FIRMS_MAP_KEY", raising=False)
    assert fetch.load_key() == "abc123"
    monkeypatch.setenv("FIRMS_MAP_KEY", "fromenv")
    assert fetch.load_key() == "fromenv"


def test_clip_keeps_only_argentina():
    import pandas as pd

    df = pd.DataFrame({
        "latitude": ["-31.42", "-33.45", "-25.28", "-34.60"],
        "longitude": ["-64.18", "-70.66", "-57.63", "-58.38"],
    })  # Córdoba, Santiago de Chile, Asunción, CABA
    kept = fetch.clip(df, fetch.country_shape())
    assert list(kept.index) == [0, 3]


def test_window_is_common_to_all_sources():
    avail = {"MODIS_NRT": (date(2026, 9, 1), date(2026, 11, 14)),
             "VIIRS_SNPP_NRT": (date(2026, 8, 1), date(2026, 11, 2))}
    srcs = list(avail)
    # el fin es el último disponible entre fuentes, no el de cada una
    assert fetch.window(avail, srcs, 30, None, None) == (date(2026, 10, 16), date(2026, 11, 14))
    assert fetch.window(avail, srcs, 30, date(2026, 9, 1), None) == (
        date(2026, 9, 1), date(2026, 11, 14))
    with pytest.raises(fetch.FirmsError):
        fetch.window(avail, srcs, 30, date(2026, 12, 1), date(2026, 11, 1))


def test_load_key_missing(tmp_path, monkeypatch):
    monkeypatch.setattr(fetch, "ENV_FILE", tmp_path / "nope")
    monkeypatch.delenv("FIRMS_MAP_KEY", raising=False)
    with pytest.raises(fetch.FirmsError):
        fetch.load_key()
