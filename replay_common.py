"""Utilidades y repetición por tramos, comunes a las fuentes FastF1 y OpenF1.

La repetición se sirve en dos partes para no esperar la sesión completa:
  * `Replay.base()`: lo liviano (pista, pilotos, vueltas, clima, mensajes...);
  * `Replay.chunk(k)`: posiciones y telemetría de un tramo de CHUNK_SECONDS, que se
    piden a la fuente recién cuando el frontend llega a ese tramo.
Todos los tiempos están en segundos desde un origen propio de la sesión.
"""
import math
import re

import numpy as np
import pandas as pd

STEP = 0.5  # segundos entre fotogramas de la repetición
CHUNK_SECONDS = 300  # duración de cada tramo que se carga bajo demanda
FRAMES_PER_CHUNK = int(CHUNK_SECONDS / STEP)
MARGIN = 3.0  # segundos extra de muestras a cada lado del tramo para interpolar en los bordes


def secs(v):
    if v is None or pd.isna(v):
        return None
    return round(v.total_seconds(), 3)


def num(v, nd=None):
    if v is None:
        return None
    try:
        if pd.isna(v):
            return None
    except (TypeError, ValueError):
        pass
    if isinstance(v, (np.bool_, bool)):
        return bool(v)
    v = float(v)
    return int(round(v)) if nd is None else round(v, nd)


def text(v):
    return None if v is None or (not isinstance(v, str) and pd.isna(v)) else str(v)


def arr(a, nd=0):
    a = np.asarray(a, dtype=float)
    if nd == 0:
        return [None if v != v else int(round(v)) for v in a.tolist()]
    return [None if v != v else round(v, nd) for v in a.tolist()]


def rotate(x, y, deg):
    r = np.deg2rad(deg)
    c, s = np.cos(r), np.sin(r)
    return x * c - y * s, x * s + y * c


def resample(src_t, vals, grid, max_gap=2.0):
    """Interpola `vals` sobre `grid`, dejando NaN donde faltan datos."""
    vals = np.asarray(vals, dtype=float)
    ok = ~np.isnan(vals)
    src_t, vals = src_t[ok], vals[ok]
    if len(src_t) < 2:
        return np.full(len(grid), np.nan)
    out = np.interp(grid, src_t, vals, left=np.nan, right=np.nan)
    idx = np.clip(np.searchsorted(src_t, grid), 1, len(src_t) - 1)
    out[(src_t[idx] - src_t[idx - 1]) > max_gap] = np.nan
    return out


def project(px, py, rx, ry, rfrac):
    """Fracción de vuelta (0..1) del punto de la pista de referencia más cercano."""
    out = np.full(len(px), np.nan)
    ok = ~np.isnan(px)
    pts = np.stack([px[ok], py[ok]], 1)
    ref = np.stack([rx, ry], 1)
    res = np.empty(len(pts))
    for k in range(0, len(pts), 2000):
        d = ((pts[k:k + 2000, None, :] - ref[None, :, :]) ** 2).sum(-1)
        res[k:k + 2000] = rfrac[d.argmin(1)]
    out[ok] = res
    return out


def corners_from(ci, rot):
    """Curvas de un CircuitInfo de FastF1, rotadas como la pista."""
    if ci is None or ci.corners is None or ci.corners.empty:
        return []
    cx, cy = rotate(ci.corners["X"].to_numpy(float), ci.corners["Y"].to_numpy(float), rot)
    return [{"n": f"{c.Number}{c.Letter or ''}", "x": num(cx[i]), "y": num(cy[i]),
             "a": num(c.Angle, 1), "d": num(c.Distance, 1)}
            for i, c in enumerate(ci.corners.itertuples())]


def fastest_from_car(car_t, car, start, end, lap):
    """Telemetría de una vuelta con distancia integrada a partir de la velocidad."""
    m = (car_t >= start) & (car_t <= end)
    if m.sum() < 10:
        return None
    t = car_t[m]
    spd = np.asarray(car["spd"], float)[m]
    dist = np.concatenate([[0], np.cumsum((spd[1:] + spd[:-1]) / 2 / 3.6 * np.diff(t))])
    return {"lap": lap["n"], "t": lap["t"], "cmp": lap["cmp"], "dist": arr(dist), "spd": arr(spd),
            "thr": arr(np.clip(np.asarray(car["thr"], float)[m], 0, 100)),
            "brk": arr(np.asarray(car["brk"], float)[m]), "gear": arr(np.asarray(car["gear"], float)[m])}


def fastest_lap_of(laps):
    timed = [l for l in laps if l["t"] is not None and l["start"] is not None and l["n"] > 1 and not l.get("del")]
    return min(timed, key=lambda l: l["t"]) if timed else None


def hold(src_t, vals, grid):
    """Último valor conocido en cada instante de `grid` (NaN antes del primero)."""
    src_t = np.asarray(src_t, float)
    vals = np.asarray(vals, float)
    if not len(src_t):
        return np.full(len(grid), np.nan)
    idx = np.searchsorted(src_t, grid, side="right") - 1
    return np.where(idx >= 0, vals[np.maximum(idx, 0)], np.nan)


class Replay:
    """Una sesión lista para servirse por tramos.

    ref: x, y (sin rotar), dist y spd de la vuelta de referencia que dibuja la pista.
    laps[num]: vueltas del piloto (n, t, start, end, del, cmp, ...).
    samples(a, b) -> {num: {pos_t, pos_x, pos_y, hidden (bool por muestra o None), car_t,
                            car{spd,rpm,gear,thr,brk,drs}}} con las muestras crudas entre a y b.
    fastest(num) -> telemetría de la vuelta más rápida del piloto (ver fastest_from_car) o None.
    official[num] (opcional, carreras): cronometraje oficial con pos_t/pos y gap_t con
              gap, int (intervalo), down e idown (vueltas perdidas con el líder / con el de adelante).
    """

    def __init__(self, *, meta, is_race, rot, corners, ref, drivers, laps, t0, t1, weather, status,
                 messages, samples, fastest, official=None):
        self.meta = {**meta, "isRace": is_race}
        self.is_race, self.rot, self.corners = is_race, rot, corners
        self.drivers, self.laps, self.official = drivers, laps, official
        self.weather, self.status, self.messages = weather, status, messages
        self.samples, self._fastest = samples, fastest
        self.rx, self.ry = rotate(np.asarray(ref["x"], float), np.asarray(ref["y"], float), rot)
        self.rdist = np.asarray(ref["dist"], float)
        self.rspd = ref["spd"]
        self.rfrac = self.rdist / self.rdist[-1]
        self.grid = np.arange(t0, t1, STEP)
        self.n = len(self.grid)

        # Arreglos de vueltas por piloto, para saber en qué vuelta va cada uno en cualquier instante
        self.lapinfo = {}
        for d in drivers:
            L = laps[d["num"]]
            ends = np.array([np.nan if l["end"] is None else l["end"] for l in L], float)
            starts = np.array([np.nan if l["start"] is None else l["start"] for l in L], float)
            ends = np.fmax.accumulate(ends)
            ends[np.isnan(ends)] = np.inf
            st = np.maximum.accumulate(pd.Series(starts).bfill().fillna(np.inf).to_numpy())
            lapnums = np.array([l["n"] for l in L], float)
            last_end = np.nanmax(np.where(np.isinf(ends), starts, ends))
            d["lastEnd"] = round(float(last_end), 2)
            d["lapsDone"] = int(lapnums[np.isfinite(ends)].max()) if np.isfinite(ends).any() else 0
            lt = np.array([np.nan if l["t"] is None or l.get("del") else l["t"] for l in L], float)
            self.lapinfo[d["num"]] = {
                "ends": ends, "st": st, "lapnums": lapnums,
                "bounds": np.unique(np.concatenate([ends[np.isfinite(ends)], st[np.isfinite(st)]])),
                "run_best": np.fmin.accumulate(lt),
            }

        # Sin cronometraje oficial (FastF1) el orden y los gaps se estiman con el progreso en pista,
        # que necesita la carrera completa; esa fuente ya tiene todo en memoria, así que se calcula una vez.
        self.g_ranked = self.g_gaps = None
        if is_race and not official:
            self._estimate_full_race()

    # ------------------------------------------------------------ cálculos por tramo
    def _laps_state(self, num_, g):
        li = self.lapinfo[num_]
        done = np.searchsorted(li["ends"], g, side="right")
        by_end = np.where(done > 0, li["lapnums"][np.maximum(done - 1, 0)], 0)
        started = np.searchsorted(li["st"], g, side="right")
        by_start = np.where(started > 0, li["lapnums"][np.maximum(started - 1, 0)] - 1, 0)
        # vueltas completadas según el NÚMERO de vuelta: las fuentes a veces omiten un registro
        completed = np.maximum(by_end, by_start)
        return done, completed, np.minimum(completed + 1, li["lapnums"].max())

    def _progress(self, num_, g, x, y, completed):
        li = self.lapinfo[num_]
        frac = project(x, y, self.rx, self.ry, self.rfrac)
        b = li["bounds"]
        kb = np.searchsorted(b, g, side="right")
        prev_b = np.where(kb > 0, b[np.maximum(kb - 1, 0)], -np.inf)
        next_b = np.where(kb < len(b), b[np.minimum(kb, len(b) - 1)], np.inf)
        frac = np.where((frac > 0.8) & (g - prev_b < 8), frac - 1, frac)
        frac = np.where((frac < 0.2) & (next_b - g < 8), frac + 1, frac)
        return completed + pd.Series(frac).ffill().bfill().fillna(0).to_numpy()

    def _ranked(self, prog, g):
        # Tras la bandera a cuadros la posición en pista ya no ordena: los que terminan
        # quedan fijos por vueltas completadas y, a igualdad, por quién cruzó antes.
        ranked = prog.copy()
        for i, d in enumerate(self.drivers):
            if re.search(r"Finished|Lap", d.get("status") or ""):
                after = g > d["lastEnd"]
                ranked[i, after] = d["lapsDone"] + 0.5 - d["lastEnd"] * 1e-6
        return ranked

    def _positions(self, d, s, g):
        p = s.get(d["num"])
        if p is None or len(p["pos_t"]) < 2:
            return np.full(len(g), np.nan), np.full(len(g), np.nan)
        px, py = rotate(p["pos_x"], p["pos_y"], self.rot)
        x, y = resample(p["pos_t"], px, g), resample(p["pos_t"], py, g)
        hidden = np.zeros(len(g), bool)
        if p.get("hidden") is not None:
            hidden |= resample(p["pos_t"], p["hidden"].astype(float), g, max_gap=1e9) >= 0.5
        if self.is_race:
            hidden |= g > d["lastEnd"] + 15
        x[hidden] = np.nan
        y[hidden] = np.nan
        return x, y

    def _estimate_full_race(self):
        g = self.grid
        s = self.samples(g[0] - MARGIN, g[-1] + MARGIN)
        prog = np.full((len(self.drivers), self.n), np.nan)
        for i, d in enumerate(self.drivers):
            x, y = self._positions(d, s, g)
            _, completed, _ = self._laps_state(d["num"], g)
            prog[i] = self._progress(d["num"], g, x, y, completed)
        ranked = self._ranked(prog, g)
        leaders = np.argsort(-ranked, axis=0, kind="stable")[0]
        gaps = np.full_like(prog, np.nan)
        for L in np.unique(leaders):
            cols = np.where(leaders == L)[0]
            mono = np.maximum.accumulate(prog[L])
            gaps[:, cols] = g[cols] - np.interp(prog[:, cols], mono, g)
        gaps = np.clip(gaps, 0, None)
        for i, d in enumerate(self.drivers):  # el gap queda congelado al terminar
            k = np.searchsorted(g, d["lastEnd"]) - 1
            if 0 <= k < self.n - 1:
                gaps[i, k + 1:] = gaps[i, k]
        self.g_ranked, self.g_gaps = ranked, gaps

    # ------------------------------------------------------------------ salidas
    def base(self) -> dict:
        nchunks = math.ceil(self.n / FRAMES_PER_CHUNK)
        return {
            "meta": self.meta,
            "track": {"x": arr(self.rx), "y": arr(self.ry), "dist": arr(self.rdist), "spd": arr(self.rspd),
                      "corners": self.corners, "rotation": self.rot},
            "timeline": {"t0": round(float(self.grid[0]), 3), "step": STEP, "n": self.n,
                         "chunk": FRAMES_PER_CHUNK, "nchunks": nchunks},
            "drivers": self.drivers, "laps": self.laps,
            "fastestLaps": {d["num"]: fl["n"] for d in self.drivers if (fl := fastest_lap_of(self.laps[d["num"]]))},
            "weather": self.weather, "status": self.status, "messages": self.messages,
        }

    def chunk(self, k: int) -> dict:
        a = k * FRAMES_PER_CHUNK
        b = min(self.n, a + FRAMES_PER_CHUNK)
        if a >= b:
            raise IndexError(f"El tramo {k} no existe")
        g = self.grid[a:b]
        m = len(g)
        s = self.samples(g[0] - MARGIN, g[-1] + MARGIN)
        frames = {}
        prog = np.full((len(self.drivers), m), np.nan)
        best = np.full((len(self.drivers), m), np.nan)
        for i, d in enumerate(self.drivers):
            x, y = self._positions(d, s, g)
            done, completed, cur_lap = self._laps_state(d["num"], g)
            p = s.get(d["num"])
            if p is not None and len(p["car_t"]) >= 2:
                ct, car = p["car_t"], p["car"]
                tel = {
                    "spd": resample(ct, car["spd"], g), "rpm": resample(ct, car["rpm"], g),
                    "gear": np.round(resample(ct, car["gear"], g)),
                    "thr": resample(ct, np.clip(np.asarray(car["thr"], float), 0, 100), g),
                    "brk": resample(ct, car["brk"], g),
                    "drs": np.nan_to_num(resample(ct, car["drs"], g)) >= 0.5,
                }
            else:
                tel = {key: np.full(m, np.nan) for key in ("spd", "rpm", "gear", "thr", "brk", "drs")}
            if self.is_race:
                prog[i] = self._progress(d["num"], g, x, y, completed)
            else:
                rb = self.lapinfo[d["num"]]["run_best"]
                best[i] = np.where(done > 0, rb[np.maximum(done - 1, 0)], np.nan)
            frames[d["num"]] = {"x": arr(x), "y": arr(y), "lap": arr(cur_lap), **{key: arr(v) for key, v in tel.items()}}

        if self.is_race:
            if self.official:
                ranked = self._ranked(prog, g)
                # posición oficial; el progreso en pista solo desempata (por ejemplo en la parrilla)
                opos = np.full_like(prog, np.nan)
                gaps = np.full_like(prog, np.nan)
                for i, d in enumerate(self.drivers):
                    o = self.official.get(d["num"])
                    if o is None:
                        continue
                    opos[i] = hold(o["pos_t"], o["pos"], g)
                    gaps[i] = hold(o["gap_t"], o["gap"], g)
                    frames[d["num"]].update({key: arr(hold(o["gap_t"], o[key], g), 3) for key in ("int", "down", "idown")})
                order = np.lexsort((-np.nan_to_num(ranked, nan=-1e9), np.nan_to_num(opos, nan=99)), axis=0)
            else:
                ranked, gaps = self.g_ranked[:, a:b], self.g_gaps[:, a:b]
                order = np.argsort(-ranked, axis=0, kind="stable")
            for i, d in enumerate(self.drivers):
                frames[d["num"]]["prog"] = arr(ranked[i], 3)
        else:
            key = np.where(np.isnan(best), np.inf, best)
            order = np.argsort(key, axis=0, kind="stable")
            gaps = best - key.min(axis=0)
            gaps[~np.isfinite(gaps)] = np.nan
            for i, d in enumerate(self.drivers):
                frames[d["num"]]["best"] = arr(best[i], 3)
        for i, d in enumerate(self.drivers):
            frames[d["num"]]["gap"] = arr(gaps[i], 3)
        return {"k": k, "start": a, "frames": frames, "order": order.T.tolist()}

    def fastest(self, num_: str):
        return self._fastest(num_)
