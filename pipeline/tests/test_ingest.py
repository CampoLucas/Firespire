from pathlib import Path

import duckdb
import pytest

from firespire import ingest

MODIS_HDR = (
    "latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,"
    "confidence,version,bright_t31,frp,daynight,type"
)
VIIRS_HDR = (
    "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,"
    "confidence,version,bright_ti5,frp,daynight,type"
)
VIIRS_HDR_NO_TYPE = VIIRS_HDR.rsplit(",", 1)[0]


def write(path: Path, header: str, rows: list[str]) -> None:
    path.write_text(header + "\n" + "\n".join(rows) + "\n")


@pytest.fixture
def con():
    return duckdb.connect()


def test_discover_maps_files_and_ignores_others(tmp_path):
    write(tmp_path / "modis_2023_Argentina.csv", MODIS_HDR, [])
    write(tmp_path / "viirs-snpp_2023_Argentina.csv", VIIRS_HDR, [])
    write(tmp_path / "viirs-jpss1_2024_Argentina.csv", VIIRS_HDR, [])
    write(tmp_path / "viirs-jpss2_2024_Argentina.csv", VIIRS_HDR, [])
    write(tmp_path / "otro.csv", VIIRS_HDR, [])
    found = ingest.discover([tmp_path])
    got = {(f.family, f.satellite, f.year) for f in found}
    assert got == {
        ("MODIS", None, 2023),
        ("VIIRS", "SNPP", 2023),
        ("VIIRS", "N20", 2024),
        ("VIIRS", "N21", 2024),
    }


def test_unknown_viirs_key_raises(tmp_path):
    write(tmp_path / "viirs-xyz_2023_Argentina.csv", VIIRS_HDR, [])
    with pytest.raises(ValueError, match="xyz"):
        ingest.discover([tmp_path])


def test_unknown_modis_satellite_raises(tmp_path, con):
    write(
        tmp_path / "modis_2023_Argentina.csv",
        MODIS_HDR,
        ["-30.0,-60.0,310,1,1,2023-01-01,0300,Marte,MODIS,85,61.03,290,10,D,0"],
    )
    with pytest.raises(ValueError, match="Marte"):
        ingest.ingest(con, [tmp_path])


def test_ingest_modis_and_viirs(tmp_path, con):
    write(
        tmp_path / "modis_2023_Argentina.csv",
        MODIS_HDR,
        [
            "-30.0,-60.0,310,1,1,2023-01-01,0300,Terra,MODIS,85,61.03,290,10,N,0",
            "-30.1,-60.1,310,1,1,2023-01-02,15,Aqua,MODIS,40,61.03NRT,290,11,D,0",
            "-30.2,-60.2,310,1,1,2023-01-03,1200,Aqua,MODIS,10,61.03,290,12,D,2",
        ],
    )
    write(
        tmp_path / "viirs-jpss1_2023_Argentina.csv",
        VIIRS_HDR,
        [
            "-31.0,-61.0,300,0.4,0.4,2023-01-01,0425,N20,VIIRS,h,2.0NRT,290,1.5,N,0",
            "-31.1,-61.1,300,0.4,0.4,2023-01-01,0426,N20,VIIRS,n,2,290,1.5,D,0",
            "-31.2,-61.2,300,0.4,0.4,2023-01-01,0427,N20,VIIRS,l,2,290,1.5,D,0",
        ],
    )
    ingest.ingest(con, [tmp_path])
    rows = con.execute(
        "SELECT family, satellite, acq_time, confidence_raw, confidence_class, type, product "
        "FROM detections ORDER BY family, lat DESC"
    ).fetchall()
    assert len(rows) == 6
    modis = [r for r in rows if r[0] == "MODIS"]
    assert [r[1] for r in modis] == ["Terra", "Aqua", "Aqua"]
    assert [r[4] for r in modis] == [2, 1, 0]  # 85, 40, 10
    assert [r[2] for r in modis] == ["0300", "0015", "1200"]  # cero-relleno
    assert [r[6] for r in modis] == ["SP", "NRT", "SP"]
    assert [r[5] for r in modis] == [0, 0, 2]
    viirs = [r for r in rows if r[0] == "VIIRS"]
    assert {r[1] for r in viirs} == {"N20"}
    assert [r[4] for r in viirs] == [2, 1, 0]  # h, n, l
    assert [r[6] for r in viirs] == ["NRT", "SP", "SP"]
    types = dict(con.execute("SELECT column_name, data_type FROM information_schema.columns "
                             "WHERE table_name='detections'").fetchall())
    assert types["acq_date"] == "DATE" and types["lat"] == "DOUBLE" and types["type"] == "TINYINT"


def test_viirs_file_without_type_column(tmp_path, con):
    write(
        tmp_path / "viirs-snpp_2023_Argentina.csv",
        VIIRS_HDR_NO_TYPE,
        ["-31.0,-61.0,300,0.4,0.4,2023-01-01,0425,N,VIIRS,n,2,290,1.5,N"],
    )
    ingest.ingest(con, [tmp_path])
    assert con.execute("SELECT satellite, type FROM detections").fetchall() == [("SNPP", None)]


FUENTES = Path(__file__).resolve().parents[2] / "fuentes"


@pytest.mark.skipif(
    not (FUENTES / "modis_2023_Argentina.csv").exists(), reason="no hay fuentes/ reales"
)
def test_real_data_pipeline_a():
    from firespire import celldays, filters, mask

    con = duckdb.connect()
    ingest.ingest(con, [FUENTES])
    n_det = con.execute("SELECT count(*) FROM detections").fetchone()[0]
    assert n_det > 0
    filters.apply(con)
    n_f = con.execute("SELECT count(*) FROM detections_filtered").fetchone()[0]
    assert 0 < n_f <= n_det
    celldays.assign_cells(con)
    assert con.execute("SELECT count(*) FROM det_cells WHERE h3 IS NULL").fetchone()[0] == 0
    assert con.execute("SELECT count(*) FROM det_cells").fetchone()[0] == n_f
    mask.build(con)
    celldays.build(con)
    assert con.execute("SELECT count(*) FROM cell_days").fetchone()[0] > 0
    fam = dict(con.execute("SELECT family, count(*) FROM cell_days GROUP BY 1").fetchall())
    assert set(fam) <= {"MODIS", "VIIRS"}
    sats = {r[0] for r in con.execute("SELECT DISTINCT satellite FROM cell_days").fetchall()}
    assert sats <= {"Terra", "Aqua", "SNPP", "N20", "N21"}
    assert con.execute("SELECT count(*) FROM cell_days WHERE h3 IS NULL").fetchone()[0] == 0
