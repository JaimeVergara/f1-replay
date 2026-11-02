"""Genera la versión estática de F1 Replay para GitHub Pages.

GitHub Pages no ejecuta Python, así que este script arma de antemano todo lo que el
servidor Flask entregaría (calendario, base de cada sesión, tramos y vueltas rápidas)
como archivos JSON dentro de `site/`, junto al frontend en modo estático.

Uso:  python export_static.py --years 2026 [--sessions Race Sprint] [--limit N]
Lo ya generado queda en cache/, así que volver a ejecutarlo solo agrega sesiones nuevas.
"""
import argparse
import json
import shutil
import sys
import time
from pathlib import Path

import app as server

BASE = Path(__file__).resolve().parent
SITE = BASE / "site"


def write(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")


def get_json(client, url):
    r = client.get(url)  # sin Accept-Encoding el servidor responde JSON sin comprimir
    return r.status_code, r.get_json(silent=True)


def export_session(client, year, rnd, ses) -> bool:
    url = f"/api/replay/{year}/{rnd}/{ses}"
    status, base = get_json(client, url)
    if status != 200:
        print(f"    sin datos: {(base or {}).get('error', status)}")
        return False
    out = SITE / "data" / "replay" / str(year) / str(rnd) / ses.replace(" ", "_")
    write(out / "base.json", base)
    for k in range(base["timeline"]["nchunks"]):
        status, chunk = get_json(client, f"{url}/chunk/{k}")
        if status != 200:
            print(f"    tramo {k} falló: {(chunk or {}).get('error', status)}")
            return False
        write(out / "chunk" / f"{k}.json", chunk)
    for dn in base["fastestLaps"]:
        status, fl = get_json(client, f"{url}/fastest/{dn}")
        write(out / "fastest" / f"{dn}.json", fl if status == 200 else None)
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--years", type=int, nargs="+", default=[2026])
    ap.add_argument("--sessions", nargs="+", default=["Race", "Sprint"],
                    help="nombres de sesión de FastF1 a exportar (Race, Sprint, Qualifying...)")
    ap.add_argument("--limit", type=int, default=0, help="máximo de sesiones por año (0 = todas)")
    args = ap.parse_args()

    if SITE.exists():
        shutil.rmtree(SITE)
    shutil.copytree(BASE / "static", SITE / "static")
    shutil.copy(BASE / "static" / "index.html", SITE / "index.html")
    (SITE / "static" / "config.js").write_text("window.F1_STATIC = true;\n", encoding="utf-8")
    (SITE / ".nojekyll").write_text("", encoding="utf-8")  # Pages sirve los archivos tal cual

    client = server.app.test_client()
    years = []
    for year in args.years:
        status, sch = get_json(client, f"/api/schedule/{year}")
        if status != 200:
            print(f"{year}: no se pudo leer el calendario ({(sch or {}).get('error')})", file=sys.stderr)
            continue
        done = 0
        for ev in sch["events"]:
            for s in ev["sessions"]:
                wanted = s["name"] in args.sessions and s["past"] and not s["recent"]
                if wanted and (not args.limit or done < args.limit):
                    t = time.time()
                    print(f"{year} R{ev['round']} {ev['name']} · {s['name']}")
                    s["past"] = export_session(client, year, ev["round"], s["name"])
                    done += s["past"]
                    print(f"    {'listo' if s['past'] else 'omitido'} en {time.time() - t:.0f} s")
                else:
                    s["past"] = False  # en el sitio estático solo se pueden abrir las exportadas
                s["recent"] = False
        sch["auth"] = False
        write(SITE / "data" / "schedule" / f"{year}.json", sch)
        if done:
            years.append(year)
    write(SITE / "data" / "years.json", sorted(years, reverse=True))
    print(f"Sitio generado en {SITE} con {len(years)} temporada(s).")


if __name__ == "__main__":
    main()
