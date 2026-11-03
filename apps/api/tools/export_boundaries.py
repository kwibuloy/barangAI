"""Write one city's barangays as GeoJSON for barangai.barangays, from a PSGC barangay shapefile zip.

Source: PH_Adm4_BgySubMuns.shp.zip from https://github.com/faeldon/philippines-psgc-shapefiles (WGS 84 / UTM 51N).
The zip is about 200 MB, so it stays out of the repository. Standard library only.

    python apps/api/tools/export_boundaries.py PH_Adm4_BgySubMuns.shp.zip apps/api/data/dasmarinas-barangays.geojson
"""

import argparse
import json
import math
import struct
import zipfile
from pathlib import Path

DASMARINAS = "402106000"
LAYER = "PH_Adm4_BgySubMuns"
SOURCE = (
    "NAMRIA and PSA, via OCHA COD-AB (CC BY-IGO); names and codes matched to PSGC 3Q 2026 by "
    "philippines-psgc-shapefiles v1.0.0 (MIT, James Faeldon)"
)


def utm51_to_lng_lat(easting: float, northing: float) -> list[float]:
    """Inverse transverse Mercator (Krüger series) on WGS 84. Six decimals is about 11 cm."""
    n = (1 / 298.257223563) / (2 - 1 / 298.257223563)
    radius = 6378137.0 / (1 + n) * (1 + n**2 / 4 + n**4 / 64)
    beta = (n / 2 - 2 * n**2 / 3 + 37 * n**3 / 96, n**2 / 48 + n**3 / 15, 17 * n**3 / 480)
    delta = (2 * n - 2 * n**2 / 3 - 2 * n**3, 7 * n**2 / 3 - 8 * n**3 / 5, 56 * n**3 / 15)
    xi = northing / (0.9996 * radius)
    eta = (easting - 500000) / (0.9996 * radius)
    xi1 = xi - sum(b * math.sin(2 * j * xi) * math.cosh(2 * j * eta) for j, b in enumerate(beta, 1))
    eta1 = eta - sum(b * math.cos(2 * j * xi) * math.sinh(2 * j * eta) for j, b in enumerate(beta, 1))
    chi = math.asin(math.sin(xi1) / math.cosh(eta1))
    lat = chi + sum(d * math.sin(2 * j * chi) for j, d in enumerate(delta, 1))
    lng = math.radians(123) + math.atan2(math.sinh(eta1), math.cos(xi1))
    return [round(math.degrees(lng), 6), round(math.degrees(lat), 6)]


def area(ring: list) -> float:
    return abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(ring, ring[1:], strict=False))) / 2


def in_ring(lng: float, lat: float, ring: list) -> bool:
    inside = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:], strict=False):
        if (y1 > lat) != (y2 > lat) and lng < (x2 - x1) * (lat - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def to_geometry(rings: list[list]) -> dict:
    """A shapefile keeps every ring in one list; a ring inside a larger one is its hole."""
    polygons: list[list] = []
    for ring in sorted(rings, key=area, reverse=True):
        host = next((polygon for polygon in polygons if in_ring(*ring[0], polygon[0])), None)
        if host:
            host.append(ring)
        else:
            polygons.append([ring])
    if len(polygons) == 1:
        return {"type": "Polygon", "coordinates": polygons[0]}
    return {"type": "MultiPolygon", "coordinates": polygons}


def read_table(dbf: bytes):
    count, header, width = struct.unpack("<xxxxIHH", dbf[:12])
    fields, position = [], 32
    while dbf[position] != 0x0D:
        fields.append((dbf[position : position + 11].split(b"\0")[0].decode(), dbf[position + 16]))
        position += 32
    for index in range(count):
        offset, row = header + index * width + 1, {}
        for name, size in fields:
            row[name] = dbf[offset : offset + size].decode("utf-8").strip()
            offset += size
        yield index, row


def read_rings(shp: bytes, shx: bytes, index: int) -> list[list]:
    offset = struct.unpack(">I", shx[100 + index * 8 : 104 + index * 8])[0] * 2
    parts_count, points_count = struct.unpack("<2i", shp[offset + 44 : offset + 52])
    parts = [*struct.unpack(f"<{parts_count}i", shp[offset + 52 : offset + 52 + 4 * parts_count]), points_count]
    start = offset + 52 + 4 * parts_count
    values = struct.unpack(f"<{2 * points_count}d", shp[start : start + 16 * points_count])
    return [
        [utm51_to_lng_lat(values[2 * point], values[2 * point + 1]) for point in range(parts[part], parts[part + 1])]
        for part in range(parts_count)
    ]


def export(source: Path, city: str = DASMARINAS) -> dict:
    with zipfile.ZipFile(source) as archive:
        dbf, shp, shx = (archive.read(f"{LAYER}.{extension}") for extension in ("dbf", "shp", "shx"))
    features = [
        {
            "type": "Feature",
            "properties": {"name": row["adm4_en"], "psgc": row["adm4_psgc"].split(".")[0].zfill(10)},
            "geometry": to_geometry(read_rings(shp, shx, index)),
        }
        for index, row in read_table(dbf)
        if row["adm3_psgc"].split(".")[0] == city
    ]
    features.sort(key=lambda feature: feature["properties"]["name"])
    return {"type": "FeatureCollection", "source": SOURCE, "features": features}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--city", default=DASMARINAS, help="The city's nine-digit PSGC code, without leading zeros")
    args = parser.parse_args()
    data = export(args.source, args.city)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    # One feature to a line, so a later boundary change shows up as a readable diff.
    lines = ",\n".join(json.dumps(feature, ensure_ascii=False, separators=(",", ":")) for feature in data["features"])
    args.output.write_text(
        f'{{"type":"FeatureCollection","source":{json.dumps(data["source"])},"features":[\n{lines}\n]}}\n',
        encoding="utf-8",
    )
    print(f"{len(data['features'])} barangays written to {args.output}")
