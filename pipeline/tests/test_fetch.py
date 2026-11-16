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


def test_sources_per_product():
    assert fetch.sources_for("nrt") is fetch.SOURCES
    assert fetch.sources_for("sp") is fetch.SP_SOURCES
    assert set(fetch.SP_SOURCES) == {
        "MODIS_SP", "VIIRS_SNPP_SP", "VIIRS_NOAA20_SP", "VIIRS_NOAA21_SP"}
    # mismos prefijos de archivo en ambos productos
    assert sorted(fetch.SP_SOURCES.values()) == sorted(fetch.SOURCES.values())
    with pytest.raises(fetch.FirmsError):
        fetch.sources_for("otro")


def test_output_name_for_sp_source_is_discovered_by_ingest(tmp_path):
    assert fetch.output_name("VIIRS_NOAA21_SP", 2024) == "viirs-jpss2_2024_Argentina.csv"
    assert fetch.output_name("MODIS_SP", 2023) == fetch.output_name("MODIS_NRT", 2023)
    for source in fetch.SP_SOURCES:
        (tmp_path / fetch.output_name(source, 2024)).write_text("latitude\n")
    found = {(f.satellite, f.family) for f in ingest.discover([tmp_path])}
    assert found == {(None, "MODIS"), ("SNPP", "VIIRS"), ("N20", "VIIRS"), ("N21", "VIIRS")}


AVAIL_SP = {
    "MODIS_SP": (date(2000, 11, 1), date(2026, 8, 31)),
    "VIIRS_SNPP_SP": (date(2012, 1, 20), date(2026, 7, 31)),
    "VIIRS_NOAA20_SP": (date(2018, 4, 1), date(2026, 7, 31)),
    "VIIRS_NOAA21_SP": (date(2023, 3, 1), date(2026, 7, 31)),
    "MODIS_NRT": (date(2026, 9, 1), date(2026, 11, 15)),
    "VIIRS_SNPP_NRT": (date(2026, 8, 1), date(2026, 11, 2)),
    "VIIRS_NOAA20_NRT": (date(2026, 8, 1), date(2026, 11, 15)),
    "VIIRS_NOAA21_NRT": (date(2024, 1, 17), date(2026, 11, 15)),
}


def test_nrt_sp_mapping():
    assert set(fetch.NRT_TO_SP) == set(fetch.SOURCES)
    assert set(fetch.NRT_TO_SP.values()) == set(fetch.SP_SOURCES)
    assert fetch.SP_TO_NRT["VIIRS_SNPP_SP"] == "VIIRS_SNPP_NRT"
    assert fetch.sp_counterpart("MODIS_NRT") == "MODIS_SP"


def test_sp_cutoff_is_per_source():
    assert fetch.sp_cutoff(AVAIL_SP, "MODIS_SP") == date(2026, 8, 31)
    assert fetch.sp_cutoff(AVAIL_SP, "VIIRS_NOAA20_SP") == date(2026, 7, 31)
    with pytest.raises(fetch.FirmsError):
        fetch.sp_cutoff({"MODIS_NRT": AVAIL_SP["MODIS_NRT"]}, "MODIS_SP")


def test_after_sp_start_is_per_source_cutoff_plus_one():
    starts = fetch.after_sp_starts(AVAIL_SP, ["MODIS_NRT", "VIIRS_NOAA20_NRT"])
    assert starts == {
        "MODIS_NRT": (date(2026, 8, 31), date(2026, 9, 1)),
        "VIIRS_NOAA20_NRT": (date(2026, 7, 31), date(2026, 8, 1)),
    }
    # el inicio coincide con el comienzo del NRT de cada fuente
    for s, (_, first) in starts.items():
        assert first == AVAIL_SP[s][0]


def test_sp_default_window_is_same_as_common_logic():
    srcs = ["MODIS_SP", "VIIRS_NOAA20_SP"]
    # fin = última fecha máxima entre las fuentes, no el mínimo
    assert fetch.window(AVAIL_SP, srcs, 30, None, None) == (date(2026, 8, 2), date(2026, 8, 31))


def test_nrt_default_window_unchanged():
    avail = {"MODIS_NRT": (date(2026, 9, 1), date(2026, 11, 14)),
             "VIIRS_SNPP_NRT": (date(2026, 8, 1), date(2026, 11, 2))}
    assert fetch.window(avail, list(avail), 30, None, None) == (
        date(2026, 10, 16), date(2026, 11, 14))
