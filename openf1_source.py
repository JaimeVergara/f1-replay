"""Fuente OpenF1 (https://openf1.org): datos históricos gratuitos y sin cuenta, desde 2023.

Se usa cuando FastF1 no tiene sesión de F1TV. El calendario y las curvas del circuito
siguen viniendo de FastF1; posiciones, telemetría, vueltas, neumáticos, boxes, clima y
mensajes de Dirección de Carrera vienen de OpenF1.

Al abrir una sesión solo se descargan los datos livianos; posiciones y telemetría se piden
por ventanas de tiempo (todos los pilotos a la vez) a medida que la repetición las necesita.
"""
import hashlib
import json
import re
import threading
import time
from pathlib import Path

import fastf1
import numpy as np
import pandas as pd
import requests
from fastf1.mvapi import get_circuit_info

from replay_common import Replay, corners_from, fastest_from_car, fastest_lap_of, num

API = "https://api.openf1.org/v1"
FIRST_YEAR = 2023
CACHE_DIR = Path("cache/openf1")
MIN_INTERVAL = 0.5  # segundos entre peticiones (la API gratuita limita la frecuencia)

_http = requests.Session()
_last_request = 0.0
_pace = threading.Lock()


class NoData(Exception):
    pass


def get(endpoint, *, between=None, cache=True, **params):
    """GET a OpenF1 con caché en disco y reintentos ante el límite de peticiones.

    between=(desde, hasta) filtra por fecha; OpenF1 exige escribir `date>=` y `date<`
    tal cual en la URL, por eso no pasan por `params` (que los codificaría).
    """
    global _last_request
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    key = hashlib.sha1(json.dumps([params, between], sort_keys=True).encode()).hexdigest()[:16]
    path = CACHE_DIR / f"{endpoint}_{key}.json"
    if cache and path.exists():
        return json.loads(path.read_text())
    url = f"{API}/{endpoint}"
    if between:
        url += f"?date>={between[0]}&date<{between[1]}"
    for attempt in range(8):
        with _pace:  # varias descargas en paralelo comparten el mismo ritmo de peticiones
            wait = MIN_INTERVAL - (time.time() - _last_request)
            if wait > 0:
                time.sleep(wait)
            _last_request = time.time()
        r = _http.get(url, params=params, timeout=300)
        if r.status_code == 429 or r.status_code >= 500:
            time.sleep(float(r.headers.get("Retry-After") or min(60, 5 * 2 ** attempt)))
            continue
        if r.status_code == 404:  # OpenF1 responde 404 cuando no hay resultados
            return []
        if r.status_code in (401, 403):  # datos en vivo: OpenF1 los reserva a cuentas pagadas
            raise NoData("OpenF1 entrega los datos de una sesión en curso solo con suscripción pagada. "
                         "Conecta tu cuenta F1TV o vuelve a intentar cuando OpenF1 publique la sesión.")
        r.raise_for_status()
        data = r.json()
        if data and cache:
            path.write_text(json.dumps(data))
        return data
    raise RuntimeError(f"OpenF1 no respondió ({endpoint}); intenta de nuevo en un minuto.")


def frame(rows, t0, col="date"):
    df = pd.DataFrame(rows)
    if not df.empty and col in df:
        df["t"] = (pd.to_datetime(df[col], utc=True, format="ISO8601") - t0).dt.total_seconds()
    return df


def find_session(year, rnd, ses):
    ev = fastf1.get_event(year, rnd)
    when = None
    for k in range(1, 6):
        if ev.get(f"Session{k}") == ses:
            when = pd.Timestamp(ev[f"Session{k}DateUtc"]).tz_localize("UTC")
    if when is None:
        raise NoData(f"No existe la sesión {ses} en este evento.")
    best = None
    for cache in (True, False):  # si el calendario guardado no la tiene, se consulta de nuevo
        for s in get("sessions", year=year, cache=cache):
            dt = abs(pd.Timestamp(s["date_start"]) - when)
            if dt < pd.Timedelta(hours=3) and (best is None or dt < best[0]):
                best = (dt, s)
        if best:
            return ev, best[1]
    raise NoData("OpenF1 no tiene esta sesión.")


def track_status(rc, start):
    """Reconstruye el estado de pista (códigos de FastF1) a partir de los mensajes de carrera.

    Al llegar a `start` (la largada) se descartan las banderas previas que nunca se limpiaron.
    """
    out, last = [], None
    red = sc = False
    vsc = None
    yellow = set()
    reset = False
    for m in rc.sort_values("t").itertuples():
        if not reset and m.t >= start:
            red = sc = False
            vsc = None
            yellow.clear()
            reset = True
        msg = str(m.message or "").upper()
        flag, scope = m.flag, m.scope
        # La roja llega como texto ("RED FLAG - RACE SUSPENDED", sin campo flag) y solo
        # termina al reanudarse la sesión: los "TRACK CLEAR" durante la roja no la levantan.
        if flag == "RED" or re.search(r"\bRED FLAG\b", msg) or (m.category == "SessionStatus" and
                                                  ("ABORTED" in msg or "SUSPENDED" in msg)):
            red, sc, vsc = True, False, None
            yellow.clear()
        elif m.category == "SessionStatus" and ("STARTED" in msg or "RESUMED" in msg):
            red, sc, vsc = False, False, None
            yellow.clear()
        elif red:
            pass
        elif flag in ("GREEN", "CLEAR") and scope == "Track":
            sc = False
            vsc = None
            yellow.clear()
        elif flag in ("YELLOW", "DOUBLE YELLOW"):
            yellow.add(m.sector if pd.notna(m.sector) else 0)
        elif flag == "CLEAR" and scope == "Sector":
            yellow.discard(m.sector)
        if m.category == "SafetyCar":  # desde 2026 se abrevia "VSC DEPLOYED"
            virtual = "VIRTUAL" in msg or "VSC" in msg
            if virtual and "DEPLOYED" in msg:
                vsc = "on"
            elif virtual and "ENDING" in msg:
                vsc = "ending"
            elif "DEPLOYED" in msg:
                sc = True
        code = "5" if red else "4" if sc else "6" if vsc == "on" else "7" if vsc == "ending" else "2" if yellow else "1"
        if code != last:
            out.append({"t": round(m.t, 2), "s": code, "m": None})
            last = code
    return out or [{"t": 0, "s": "1", "m": None}]


def build(year: int, rnd: int, ses: str, fresh: bool = False) -> Replay:
    """fresh=True para sesiones en curso o recién terminadas: nada se lee ni guarda en la caché."""
    if year < FIRST_YEAR:
        raise NoData(f"Sin cuenta F1TV solo hay datos desde {FIRST_YEAR} (vía OpenF1). "
                     f"Para temporadas anteriores conecta tu cuenta F1TV.")

    def api(endpoint, cache=True, **params):
        return get(endpoint, cache=cache and not fresh, **params)

    ev, sess = find_session(year, rnd, ses)
    sk = sess["session_key"]
    T0 = pd.Timestamp(sess["date_start"])
    is_race = sess["session_name"] in ("Race", "Sprint")

    laps = frame(api("laps", session_key=sk), T0, "date_start")
    if laps.empty:
        raise NoData("OpenF1 todavía no tiene datos de vueltas de esta sesión.")
    info = {str(d["driver_number"]): d for d in api("drivers", session_key=sk)}
    results = {str(r["driver_number"]): r for r in api("session_result", session_key=sk)}
    stints = pd.DataFrame(api("stints", session_key=sk))
    pits = frame(api("pit", session_key=sk), T0)
    positions = frame(api("position", session_key=sk), T0)
    rc = frame(api("race_control", session_key=sk), T0)
    weather = frame(api("weather", session_key=sk), T0)

    rot, corners = 0.0, []
    try:
        ci = get_circuit_info(year=year, circuit_key=int(sess["circuit_key"]))
        if ci is not None:
            rot = float(ci.rotation)
            corners = corners_from(ci, rot)
    except Exception:
        pass

    # Muchas vueltas 1 de carrera no traen hora de inicio: se usa la largada real,
    # tomada de los pilotos que sí la tienen (o estimada desde el inicio de la vuelta 2).
    race_start = 0.0
    if is_race:
        lap1 = laps.loc[laps["lap_number"] == 1, "t"].dropna()
        lap2 = laps.loc[laps["lap_number"] == 2, "t"].dropna()
        if len(lap1):
            race_start = float(lap1.min())
        elif len(lap2):
            race_start = float(lap2.min() - laps["lap_duration"].median() * 1.1)

    drivers, per = [], {}
    ref_lap = None  # (tiempo, piloto, inicio, fin)
    for dn, g in laps.groupby("driver_number"):
        dn = str(dn)
        g = g.sort_values("lap_number").reset_index(drop=True)
        starts = g["t"].to_numpy(float)
        if is_race and g["lap_number"].iloc[0] == 1 and np.isnan(starts[0]):
            starts[0] = race_start
        dur = g["lap_duration"].to_numpy(float)
        ln = g["lap_number"].to_numpy(int)
        # fin de vuelta = inicio de la siguiente, salvo que falte el registro de esa siguiente
        nxt = np.append(starts[1:], np.nan)
        consecutive = np.append(ln[1:] == ln[:-1] + 1, False)
        ends = np.where(consecutive & ~np.isnan(nxt), nxt, starts + dur)
        st = stints[stints["driver_number"].astype(str) == dn] if not stints.empty else stints
        pp = pits[pits["driver_number"].astype(str) == dn] if not pits.empty else pits
        pos = positions[positions["driver_number"].astype(str) == dn].sort_values("t") if not positions.empty else positions

        lap_list = []
        for k, l in g.iterrows():
            n = int(l["lap_number"])
            t = dur[k] if not np.isnan(dur[k]) else (ends[k] - starts[k] if is_race and n == 1 else np.nan)
            s = st[(st["lap_start"] <= n) & (st["lap_end"] >= n)] if not st.empty else st
            s = s.iloc[0] if len(s) else None
            p_at = pos[pos["t"] <= ends[k]]["position"] if len(pos) and not np.isnan(ends[k]) else []
            lap_list.append({
                "n": n, "t": num(t, 3), "s1": num(l.get("duration_sector_1"), 3),
                "s2": num(l.get("duration_sector_2"), 3), "s3": num(l.get("duration_sector_3"), 3),
                "cmp": s["compound"] if s is not None else None,
                "life": num(s["tyre_age_at_start"] + n - s["lap_start"]) if s is not None else None,
                "stint": num(s["stint_number"]) if s is not None else None,
                "pin": None, "pout": round(starts[k], 2) if l.get("is_pit_out_lap") == True and n > 1 else None,  # noqa: E712 (puede ser NaN)
                "pos": num(p_at.iloc[-1]) if len(p_at) else None,
                "end": num(ends[k], 3), "start": num(starts[k], 3), "del": False,
                "st1": num(l.get("i1_speed")), "st2": num(l.get("i2_speed")), "sst": num(l.get("st_speed")),
            })
        by_n = {l["n"]: l for l in lap_list}
        for p in pp.itertuples() if len(pp) else []:
            # `date` de OpenF1 corresponde a la salida del pit lane: la entrada es date - lane
            lane = getattr(p, "lane_duration", None) or getattr(p, "pit_duration", None)
            lane = 25.0 if lane is None or pd.isna(lane) else float(lane)
            if p.lap_number in by_n:
                by_n[p.lap_number]["pin"] = round(p.t - lane, 2)
            if p.lap_number + 1 in by_n:
                by_n[p.lap_number + 1]["pout"] = round(p.t, 2)

        fl = fastest_lap_of(lap_list)
        if fl and (ref_lap is None or fl["t"] < ref_lap[0]):
            ref_lap = (fl["t"], dn, fl["start"], fl["start"] + fl["t"])

        r = results.get(dn, {})
        d = info.get(dn, {})
        gap, dur_r = r.get("gap_to_leader"), r.get("duration")
        status = ("Disqualified" if r.get("dsq") else "Did not start" if r.get("dns") else
                  "Retired" if r.get("dnf") else gap.title() if isinstance(gap, str) else "Finished")
        q = dur_r if isinstance(dur_r, list) else [None, None, None]
        first_pos = pos["position"].iloc[0] if len(pos) else None
        drivers.append({
            "num": dn, "abbr": d.get("name_acronym") or dn, "name": (d.get("full_name") or dn).title(),
            "team": d.get("team_name"), "color": f"#{d['team_colour']}" if d.get("team_colour") else "#888888",
            "headshot": d.get("headshot_url"), "pos": r.get("position"),
            "grid": num(first_pos) if is_race else None, "status": status, "points": r.get("points"),
            "time": (dur_r if r.get("position") == 1 else gap) if is_race and isinstance(gap, (int, float)) else None,
            "q1": q[0] if len(q) > 0 else None, "q2": q[1] if len(q) > 1 else None, "q3": q[2] if len(q) > 2 else None,
        })
        per[dn] = lap_list

    if not drivers or ref_lap is None:
        raise NoData("OpenF1 no tiene vueltas cronometradas para esta sesión.")
    drivers.sort(key=lambda x: x["pos"] or 99)

    def when(t):  # segundos de sesión -> fecha UTC sin zona, como la acepta el filtro de OpenF1
        return (T0 + pd.Timedelta(seconds=float(t))).tz_convert(None).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3]

    def car_of(df):
        df = df.sort_values("t").drop_duplicates("t")
        return df["t"].to_numpy(float), {
            "spd": df["speed"].to_numpy(float), "rpm": df["rpm"].to_numpy(float),
            "gear": df["n_gear"].to_numpy(float), "thr": df["throttle"].to_numpy(float),
            "brk": df["brake"].to_numpy(float),
            "drs": (pd.to_numeric(df.get("drs"), errors="coerce").fillna(0) >= 10).to_numpy(float)}

    def pos_of(df):
        df = df[(df["x"] != 0) | (df["y"] != 0)].sort_values("t").drop_duplicates("t")
        return df["t"].to_numpy(float), df["x"].to_numpy(float), df["y"].to_numpy(float)

    def samples(a, b):
        # una ventana para todos los pilotos; no se guarda en disco (el tramo procesado sí)
        loc = frame(api("location", session_key=sk, between=(when(a), when(b)), cache=False), T0)
        car = frame(api("car_data", session_key=sk, between=(when(a), when(b)), cache=False), T0)
        empty = np.array([])
        out = {}
        for dn in per:
            out[dn] = {"pos_t": empty, "pos_x": empty, "pos_y": empty, "hidden": None,
                       "car_t": empty, "car": {k: empty for k in ("spd", "rpm", "gear", "thr", "brk", "drs")}}
        for dn, g in (loc.groupby("driver_number") if not loc.empty else []):
            if str(dn) in out:
                out[str(dn)]["pos_t"], out[str(dn)]["pos_x"], out[str(dn)]["pos_y"] = pos_of(g)
        for dn, g in (car.groupby("driver_number") if not car.empty else []):
            if str(dn) in out:
                out[str(dn)]["car_t"], out[str(dn)]["car"] = car_of(g)
        return out

    def fastest(dn):
        fl = fastest_lap_of(per.get(dn, []))
        if not fl:
            return None
        a, b = fl["start"], fl["start"] + fl["t"]
        car = frame(api("car_data", session_key=sk, driver_number=int(dn), between=(when(a - 1), when(b + 1))), T0)
        if car.empty:
            return None
        car_t, cd = car_of(car)
        return fastest_from_car(car_t, cd, a, b, fl)

    # Pista de referencia: vuelta más rápida de la sesión (una ventana corta de un solo piloto)
    _, rdn, a, b = ref_lap
    loc = frame(api("location", session_key=sk, driver_number=int(rdn), between=(when(a), when(b))), T0)
    rt, rx, ry = pos_of(loc)
    rdist = np.concatenate([[0], np.cumsum(np.hypot(np.diff(rx), np.diff(ry)))]) / 10
    rcar = frame(api("car_data", session_key=sk, driver_number=int(rdn), between=(when(a - 1), when(b + 1))), T0)
    rct, rcd = car_of(rcar)
    rspd = np.interp(rt, rct, rcd["spd"])

    wx = [{"t": round(w.t, 2), "air": num(w.air_temperature, 1), "track": num(w.track_temperature, 1),
           "hum": num(w.humidity, 1), "rain": bool(w.rainfall), "wind": num(w.wind_speed, 1)}
          for w in weather.sort_values("t").itertuples()] if not weather.empty else []
    msgs = [{"t": round(m.t, 2), "cat": m.category, "flag": m.flag if pd.notna(m.flag) else None,
             "lap": num(m.lap_number), "msg": m.message}
            for m in rc.sort_values("t").itertuples()] if not rc.empty else []

    official = None
    if is_race and not positions.empty:
        iv = frame(api("intervals", session_key=sk), T0)
        official = {}
        for dn in per:
            pp = positions[positions["driver_number"].astype(str) == dn].sort_values("t")
            ii = iv[iv["driver_number"].astype(str) == dn].sort_values("t") if not iv.empty else iv
            if pp.empty:
                continue
            o = {"pos_t": pp["t"].to_numpy(float), "pos": pp["position"].to_numpy(float),
                 "gap_t": np.array([]), "gap": [], "int": [], "down": [], "idown": []}
            if len(ii):
                # los rezagados vienen como texto: "+1 LAP"
                laps_down = lambda s: s.astype(str).str.extract(r"\+(\d+) LAP", expand=False).astype(float).fillna(0)
                o.update(gap_t=ii["t"].to_numpy(float),
                         gap=pd.to_numeric(ii["gap_to_leader"], errors="coerce").to_numpy(float),
                         int=pd.to_numeric(ii["interval"], errors="coerce").to_numpy(float),
                         down=laps_down(ii["gap_to_leader"]).to_numpy(), idown=laps_down(ii["interval"]).to_numpy())
            official[dn] = o

    all_ends = [l["end"] for L in per.values() for l in L if l["end"] is not None]
    all_starts = [l["start"] for L in per.values() for l in L if l["start"] is not None]
    t0 = min(all_starts) - (15 if is_race else 0)
    winner = next((x for x in drivers if x["pos"] == 1), drivers[0])
    meta = {"year": year, "round": rnd, "event": ev["EventName"], "country": ev["Country"],
            "location": ev["Location"], "session": ses, "source": "OpenF1",
            "totalLaps": max(l["n"] for l in per[winner["num"]]),
            "fastest": {"num": rdn, "t": ref_lap[0], "lap": next(l["n"] for l in per[rdn] if l["start"] == a)}}
    return Replay(meta=meta, is_race=is_race, rot=rot, corners=corners,
                  ref={"x": rx, "y": ry, "dist": rdist, "spd": rspd},
                  drivers=drivers, laps=per, t0=t0, t1=max(all_ends) + 10, weather=wx,
                  status=track_status(rc, t0) if not rc.empty else [{"t": 0, "s": "1", "m": None}],
                  messages=msgs, samples=samples, fastest=fastest, official=official)
