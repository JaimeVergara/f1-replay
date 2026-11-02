"""F1 Replay — servidor Flask que reconstruye una sesión de F1.

Fuentes de datos:
  * FastF1 (livetiming oficial) si hay sesión de F1TV iniciada;
  * OpenF1 (gratis, sin cuenta, desde 2023) en caso contrario.
El calendario y la información del circuito siempre vienen de FastF1.

La repetición se sirve por partes: primero la base liviana y luego tramos de 5 minutos
de posiciones y telemetría, que el navegador pide a medida que avanza la reproducción.

Ejecutar:  python app.py   y abrir http://localhost:5000
"""
import gzip
import json
import logging
import threading
import time
import traceback
from collections import OrderedDict
from pathlib import Path

import fastf1
import numpy as np
import pandas as pd
from fastf1.exceptions import F1AuthError
from fastf1.internals.f1account import clear_token, token_manager
from fastf1.internals.f1account.login import login as f1_login
from flask import Flask, Response, jsonify, request, send_from_directory

import openf1_source
from replay_common import Replay, arr, corners_from, num, secs, text

BASE = Path(__file__).resolve().parent
CACHE = BASE / "cache"
OUT = CACHE / "replays"
OUT.mkdir(parents=True, exist_ok=True)
fastf1.Cache.configure(cache_dir=str(CACHE))
fastf1.set_log_level(logging.WARNING)
openf1_source.CACHE_DIR = CACHE / "openf1"

CACHE_VERSION = 4
KEEP_IN_MEMORY = 3  # sesiones abiertas que se mantienen listas para servir tramos
# Una sesión en curso o recién terminada aún recibe datos: no se guarda en disco y se
# vuelve a armar cada tanto para no quedar pegada con datos incompletos.
RECENT_HOURS = 4
RECENT_REFRESH = 60  # segundos

app = Flask(__name__, static_folder=str(BASE / "static"), static_url_path="/static")
_locks: dict[str, threading.Lock] = {}
_locks_guard = threading.Lock()
_replays: "OrderedDict[str, tuple[float, Replay]]" = OrderedDict()


def sorted_times(df):
    df = df.dropna(subset=["SessionTime"]).sort_values("SessionTime")
    t = df["SessionTime"].dt.total_seconds().to_numpy()
    keep = np.concatenate([[True], np.diff(t) > 0])
    return df[keep], t[keep]


# ------------------------------------------------------------ fuente FastF1
def build_fastf1(year: int, rnd: int, ses: str) -> Replay:
    s = fastf1.get_session(year, rnd, ses)
    s.load(laps=True, telemetry=True, weather=True, messages=True)
    laps = s.laps
    if laps is None or laps.empty:
        raise ValueError("La sesión no tiene datos de vueltas (¿aún no se ha disputado?)")
    is_race = s.name in ("Race", "Sprint")

    rot, corners = 0.0, []
    try:
        ci = s.get_circuit_info()
        rot = float(ci.rotation)
        corners = corners_from(ci, rot)
    except Exception:
        pass

    # Pista de referencia: vuelta más rápida de la sesión
    fl = laps.pick_fastest()
    ref = fl.get_telemetry().dropna(subset=["X", "Y"])

    drivers, per, lap_lists = [], {}, {}
    for r in s.results.itertuples():
        dn = str(r.DriverNumber)
        if dn not in s.pos_data or dn not in s.car_data or laps.pick_drivers(dn).empty:
            continue
        color = text(r.TeamColor)
        drivers.append({
            "num": dn, "abbr": text(r.Abbreviation), "name": text(r.FullName),
            "team": text(r.TeamName), "color": f"#{color}" if color else "#888888",
            "headshot": text(r.HeadshotUrl), "pos": num(r.Position), "grid": num(r.GridPosition),
            "status": text(r.Status), "points": num(r.Points, 1), "time": secs(r.Time),
            "q1": secs(getattr(r, "Q1", None)), "q2": secs(getattr(r, "Q2", None)),
            "q3": secs(getattr(r, "Q3", None)),
        })

        p, pt = sorted_times(s.pos_data[dn].dropna(subset=["X", "Y"]))
        c, ct = sorted_times(s.car_data[dn])
        dl = laps.pick_drivers(dn).sort_values("LapNumber")
        per[dn] = {
            "pos_t": pt, "pos_x": p["X"].to_numpy(float), "pos_y": p["Y"].to_numpy(float),
            "hidden": (p["Status"] != "OnTrack").to_numpy(),
            "car_t": ct,
            "car": {"spd": c["Speed"].to_numpy(float), "rpm": c["RPM"].to_numpy(float),
                    "gear": c["nGear"].to_numpy(float), "thr": c["Throttle"].to_numpy(float),
                    "brk": c["Brake"].to_numpy(float) * 100, "drs": (c["DRS"] >= 10).to_numpy(float)},
            "dl": dl,
        }
        lap_lists[dn] = [{
            "n": num(l.LapNumber), "t": secs(l.LapTime), "s1": secs(l.Sector1Time),
            "s2": secs(l.Sector2Time), "s3": secs(l.Sector3Time), "cmp": text(l.Compound),
            "life": num(l.TyreLife), "stint": num(l.Stint), "pin": secs(l.PitInTime),
            "pout": secs(l.PitOutTime), "pos": num(l.Position), "end": secs(l.Time),
            "start": secs(l.LapStartTime), "del": num(getattr(l, "Deleted", None)),
        } for l in dl.itertuples()]

    def samples(a, b):
        # FastF1 ya tiene la sesión completa en memoria: basta con recortar la ventana
        out = {}
        for dn, p in per.items():
            mp = (p["pos_t"] >= a) & (p["pos_t"] <= b)
            mc = (p["car_t"] >= a) & (p["car_t"] <= b)
            out[dn] = {"pos_t": p["pos_t"][mp], "pos_x": p["pos_x"][mp], "pos_y": p["pos_y"][mp],
                       "hidden": p["hidden"][mp], "car_t": p["car_t"][mc],
                       "car": {k: v[mc] for k, v in p["car"].items()}}
        return out

    def fastest(dn):
        try:
            f = per[dn]["dl"].pick_fastest()
            if f is None or pd.isna(f["LapTime"]):
                return None
            cd = f.get_car_data().add_distance()
            return {"lap": num(f["LapNumber"]), "t": secs(f["LapTime"]), "cmp": text(f["Compound"]),
                    "dist": arr(cd["Distance"]), "spd": arr(cd["Speed"]), "thr": arr(cd["Throttle"].clip(0, 100)),
                    "brk": arr(cd["Brake"].astype(float) * 100), "gear": arr(cd["nGear"])}
        except Exception:
            return None

    weather = []
    if s.weather_data is not None:
        for w in s.weather_data.itertuples():
            weather.append({"t": secs(w.Time), "air": num(w.AirTemp, 1), "track": num(w.TrackTemp, 1),
                            "hum": num(w.Humidity, 1), "rain": bool(w.Rainfall),
                            "wind": num(w.WindSpeed, 1)})
    status = [{"t": secs(ts.Time), "s": text(ts.Status), "m": text(ts.Message)}
              for ts in s.track_status.itertuples()] if s.track_status is not None else []
    messages = []
    try:
        for m in s.race_control_messages.itertuples():
            messages.append({"t": round((m.Time - s.t0_date).total_seconds(), 2),
                             "cat": text(m.Category), "flag": text(m.Flag),
                             "lap": num(m.Lap), "msg": text(m.Message)})
    except Exception:
        pass

    total_laps = getattr(s, "total_laps", None)
    ev = s.event
    meta = {"year": year, "round": rnd, "event": ev["EventName"], "country": ev["Country"],
            "location": ev["Location"], "session": s.name, "source": "FastF1 (F1TV)",
            "totalLaps": num(total_laps) if total_laps else num(laps["LapNumber"].max()),
            "fastest": {"num": str(fl["DriverNumber"]), "t": secs(fl["LapTime"]),
                        "lap": num(fl["LapNumber"])}}
    t0 = laps["LapStartTime"].dropna().min().total_seconds() - (15 if is_race else 0)
    t1 = laps["Time"].dropna().max().total_seconds() + 10
    return Replay(meta=meta, is_race=is_race, rot=rot, corners=corners,
                  ref={"x": ref["X"].to_numpy(float), "y": ref["Y"].to_numpy(float),
                       "dist": ref["Distance"].to_numpy(float), "spd": ref["Speed"].to_numpy(float)},
                  drivers=drivers, laps=lap_lists, t0=t0, t1=t1,
                  weather=weather, status=status, messages=messages, samples=samples, fastest=fastest)


# --------------------------------------------------------------- caché/rutas
def auth_status() -> dict:
    tok = token_manager.get_stored()
    if tok is None:
        return {"ok": False, "reason": "missing"}
    if not tok.is_valid():
        return {"ok": False, "reason": "expired"}
    return {"ok": True, "expires": tok.expires_at,
            "subscription": tok.claims.get("SubscriptionStatus")}


def _lock(name: str) -> threading.Lock:
    with _locks_guard:
        return _locks.setdefault(name, threading.Lock())


def session_key(year, rnd, ses) -> str:
    # cada fuente tiene su propia caché: con F1TV se usa el cronometraje oficial de FastF1
    src = "f1tv_" if auth_status()["ok"] else ""
    return f"v{CACHE_VERSION}_{src}{year}_{rnd}_{ses.replace(' ', '')}"


def is_recent(year, rnd, ses) -> bool:
    """True si la sesión está en curso o terminó hace poco (sus datos aún pueden cambiar)."""
    try:
        ev = fastf1.get_event(year, rnd)
        for k in range(1, 6):
            if ev.get(f"Session{k}") == ses:
                start = pd.Timestamp(ev[f"Session{k}DateUtc"])
                return start + pd.Timedelta(hours=RECENT_HOURS) > pd.Timestamp.now(tz="UTC").tz_localize(None)
    except Exception:
        pass
    return False


def get_replay(year, rnd, ses) -> Replay:
    key = session_key(year, rnd, ses)
    recent = is_recent(year, rnd, ses)
    with _lock(key):
        if key in _replays:
            built, rp = _replays[key]
            if not recent or time.time() - built < RECENT_REFRESH:
                _replays.move_to_end(key)
                return rp
        # Sin token F1TV, FastF1 pediría la contraseña por consola: se usa OpenF1.
        if auth_status()["ok"]:
            rp = build_fastf1(year, rnd, ses)
        else:
            rp = openf1_source.build(year, rnd, ses, fresh=recent)
        _replays[key] = (time.time(), rp)
        _replays.move_to_end(key)
        while len(_replays) > KEEP_IN_MEMORY:
            _replays.popitem(last=False)
        return rp


def cached(name: str, make, persist=True) -> bytes:
    """Respuesta JSON comprimida, guardada en disco para no recalcularla nunca más.

    Con persist=False (sesión en curso o recién terminada) se calcula siempre de nuevo.
    """
    path = OUT / f"{name}.json.gz"
    with _lock(name):
        if persist and path.exists():
            return path.read_bytes()
        raw = gzip.compress(json.dumps(make(), separators=(",", ":"), ensure_ascii=False).encode(), 6)
        if persist:
            path.write_bytes(raw)
        return raw


def send(data: bytes) -> Response:
    if "gzip" in request.headers.get("Accept-Encoding", ""):
        return Response(data, mimetype="application/json", headers={"Content-Encoding": "gzip"})
    return Response(gzip.decompress(data), mimetype="application/json")


def guarded(fn):
    try:
        return send(fn())
    except openf1_source.NoData as e:
        return jsonify(error=str(e), auth=auth_status()), 404
    except Exception as e:
        traceback.print_exc()
        return jsonify(error=f"{type(e).__name__}: {e}"), 500


@app.get("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.get("/api/auth")
def auth():
    return jsonify(auth_status())


# Las credenciales llegan solo a este servidor local (127.0.0.1) y se pasan directo al inicio
# de sesión de FastF1 con Fórmula 1; no se guardan. FastF1 guarda solo el token resultante.
# Exigir JSON obliga a otros sitios web a pasar por CORS, así no pueden usar estas rutas.
@app.post("/api/auth/login")
def auth_login():
    if not request.is_json:
        return jsonify(error="Se esperaba JSON"), 415
    body = request.get_json(silent=True) or {}
    user, pwd = (body.get("email") or "").strip(), body.get("password") or ""
    if not user or not pwd:
        return jsonify(error="Falta el correo o la contraseña."), 400
    try:
        token_manager.get(force_renew=True, auth_func=lambda: f1_login(user, pwd))
    except F1AuthError as e:
        msg = str(e)
        if "subscription" in msg.lower():
            msg = "La cuenta no tiene una suscripción F1TV activa."
        elif "credential" in msg.lower() or "password" in msg.lower():
            msg = "Correo o contraseña incorrectos."
        return jsonify(error=f"No se pudo iniciar sesión: {msg}"), 401
    _replays.clear()
    return jsonify(auth_status())


@app.post("/api/auth/logout")
def auth_logout():
    if not request.is_json:
        return jsonify(error="Se esperaba JSON"), 415
    clear_token()
    _replays.clear()
    return jsonify(auth_status())


@app.get("/api/schedule/<int:year>")
def schedule(year):
    try:
        sch = fastf1.get_event_schedule(year, include_testing=False)
    except Exception as e:
        return jsonify(error=str(e)), 500
    now = pd.Timestamp.now(tz="UTC").tz_localize(None)
    events = []
    for _, ev in sch.iterrows():
        sessions = []
        for k in range(1, 6):
            name = ev.get(f"Session{k}")
            if not isinstance(name, str) or not name:
                continue
            dt = ev.get(f"Session{k}DateUtc")
            started = bool(pd.notna(dt) and dt <= now)
            sessions.append({"name": name, "date": None if pd.isna(dt) else str(dt), "past": started,
                             "recent": started and dt + pd.Timedelta(hours=RECENT_HOURS) > now})
        events.append({"round": int(ev["RoundNumber"]), "name": ev["EventName"],
                       "country": ev["Country"], "location": ev["Location"],
                       "date": str(ev["EventDate"].date()), "sessions": sessions})
    return jsonify(events=events, openf1From=openf1_source.FIRST_YEAR, auth=auth_status()["ok"])


@app.get("/api/replay/<int:year>/<int:rnd>/<ses>")
def replay_base(year, rnd, ses):
    key, keep = session_key(year, rnd, ses), not is_recent(year, rnd, ses)
    return guarded(lambda: cached(f"{key}_base", lambda: get_replay(year, rnd, ses).base(), keep))


@app.get("/api/replay/<int:year>/<int:rnd>/<ses>/chunk/<int:k>")
def replay_chunk(year, rnd, ses, k):
    key, keep = session_key(year, rnd, ses), not is_recent(year, rnd, ses)
    return guarded(lambda: cached(f"{key}_c{k}", lambda: get_replay(year, rnd, ses).chunk(k), keep))


@app.get("/api/replay/<int:year>/<int:rnd>/<ses>/fastest/<dn>")
def replay_fastest(year, rnd, ses, dn):
    key, keep = session_key(year, rnd, ses), not is_recent(year, rnd, ses)
    return guarded(lambda: cached(f"{key}_f{dn}", lambda: get_replay(year, rnd, ses).fastest(dn), keep))


if __name__ == "__main__":
    print("F1 Replay en http://localhost:5000")
    app.run(host="127.0.0.1", port=5000, threaded=True, debug=False)
