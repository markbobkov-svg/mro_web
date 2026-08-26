"""
Turn the OurAirports dump into idempotent INSERTs for public.airports.

Scope: the map's coverage bbox (lon -32..46, lat 27..72), anything not closed
and not a balloonport, carrying an ICAO or IATA code.

Each row is inserted only when nothing already matches it by ICAO or IATA, so
the script never duplicates an airport the scraper already put there, and can be
re-run safely.
"""
import csv, os, sys

SRC = os.path.join(os.path.dirname(__file__), "airports_raw.csv")
OUT_DIR = os.path.join(os.path.dirname(__file__), "sql")
CHUNK = 750

LON_MIN, LON_MAX, LAT_MIN, LAT_MAX = -32.0, 46.0, 27.0, 72.0
SKIP_TYPES = {"closed", "balloonport"}


def q(v):
    if v is None or v == "":
        return "null"
    return "'" + str(v).replace("'", "''") + "'"


def main():
    rows, seen = [], set()
    with open(SRC, encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            if r["type"] in SKIP_TYPES:
                continue
            try:
                lat, lon = float(r["latitude_deg"]), float(r["longitude_deg"])
            except (TypeError, ValueError):
                continue
            if not (LON_MIN <= lon <= LON_MAX and LAT_MIN <= lat <= LAT_MAX):
                continue
            # OurAirports keeps the ICAO in icao_code, but older rows only carry
            # it as gps_code.
            #
            # KNOWN LIMITATION: for ~39 European rows this column disagrees with
            # the row's `ident`, and neither is reliably the real ICAO — `ident`
            # is right for MOD St Athan (EGDX, where icao_code says EGSY, which
            # is Sheffield), `icao_code` is right for the Kristianstad hospital
            # heliport (ESHI, where ident says HSHI). airports_repair.sql
            # withdraws those rows rather than guessing. If you regenerate,
            # expect to re-run that file.
            icao = (r["icao_code"] or r["gps_code"] or "").strip().upper() or None
            iata = (r["iata_code"] or "").strip().upper() or None
            if not icao and not iata:
                continue
            key = (icao, iata)
            if key in seen:            # the dump itself is not guaranteed unique
                continue
            seen.add(key)
            rows.append(
                {
                    "icao": icao,
                    "iata": iata,
                    "name": (r["name"] or "").strip() or "Airport",
                    "city": (r["municipality"] or "").strip() or None,
                    "cc": (r["iso_country"] or "").strip().upper() or None,
                    "lat": lat,
                    "lon": lon,
                }
            )

    os.makedirs(OUT_DIR, exist_ok=True)
    for old in os.listdir(OUT_DIR):
        if old.startswith("airports_seed"):
            os.remove(os.path.join(OUT_DIR, old))

    chunks = [rows[i : i + CHUNK] for i in range(0, len(rows), CHUNK)]
    for n, chunk in enumerate(chunks, 1):
        path = os.path.join(OUT_DIR, f"airports_seed_{n:02d}.sql")
        with open(path, "w", encoding="utf-8") as out:
            out.write(
                f"-- ONE4FIVE — airports seed {n}/{len(chunks)} "
                f"({len(chunk)} rows)\n"
                "--\n"
                "-- Source: OurAirports (public domain), filtered to the map's\n"
                "-- coverage bbox. Inserts an airport only when nothing already\n"
                "-- matches its ICAO or IATA, so re-running adds nothing twice.\n"
                "--\n"
                "-- Run the files in order; each is independent.\n\n"
                "insert into public.airports\n"
                "  (icao_code, iata_code, name, city, country_code, latitude, longitude)\n"
                "select v.icao_code, v.iata_code, v.name, v.city, v.country_code,\n"
                "       v.latitude, v.longitude\n"
                "  from (values\n"
            )
            lines = []
            for r in chunk:
                lines.append(
                    "    ({}, {}, {}, {}, {}, {}, {})".format(
                        q(r["icao"]), q(r["iata"]), q(r["name"]),
                        q(r["city"]), q(r["cc"]), r["lat"], r["lon"],
                    )
                )
            out.write(",\n".join(lines))
            out.write(
                "\n  ) as v (icao_code, iata_code, name, city, country_code,\n"
                "          latitude, longitude)\n"
                " where not exists (\n"
                "   select 1 from public.airports a\n"
                "    where (v.icao_code is not null and a.icao_code = v.icao_code)\n"
                "       or (v.iata_code is not null and a.iata_code = v.iata_code)\n"
                " );\n"
            )
        print(f"{path}  {len(chunk)} rows  {os.path.getsize(path)/1024:.0f} KB")

    print(f"\ntotal {len(rows)} airports in {len(chunks)} files")


if __name__ == "__main__":
    main()
