/* F1 Replay — frontend */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const COMPOUND = { SOFT: "#e8002d", MEDIUM: "#ffd12e", HARD: "#f0f0ec", INTERMEDIATE: "#43b02a", WET: "#0067ad" };
const CMP_LETTER = { SOFT: "S", MEDIUM: "M", HARD: "H", INTERMEDIATE: "I", WET: "W" };
const TRACK_STATUS = {
  "1": { t: "PISTA LIBRE", c: "#1fbf5f", fg: "#04130a" },
  "2": { t: "BANDERA AMARILLA", c: "#ffd400", fg: "#1a1600" },
  "4": { t: "SAFETY CAR", c: "#ff9f1a", fg: "#1a0f00" },
  "5": { t: "BANDERA ROJA", c: "#ff2d2d", fg: "#fff" },
  "6": { t: "VIRTUAL SAFETY CAR", c: "#ff9f1a", fg: "#1a0f00" },
  "7": { t: "FIN DEL VSC", c: "#ff9f1a", fg: "#1a0f00" },
};
/* -------------------------------------------------------------- traducciones */
const CMP_ES = { SOFT: "blando", MEDIUM: "medio", HARD: "duro", INTERMEDIATE: "intermedio", WET: "lluvia" };
const cmpEs = (c) => CMP_ES[c] || (c ? c.toLowerCase() : "?");

function statusEs(s) {
  if (!s) return "";
  const m = s.match(/^\+(\d+) Laps?$/i);
  if (m) return `+${m[1]} vuelta${m[1] === "1" ? "" : "s"}`;
  return ({
    Finished: "Terminó", Retired: "Abandono", "Did not start": "No largó", Disqualified: "Descalificado",
    Lapped: "Doblado", Accident: "Accidente", Collision: "Choque", "Collision damage": "Daño por choque",
    Engine: "Motor", Gearbox: "Caja de cambios", Hydraulics: "Hidráulica", Brakes: "Frenos", Power: "Pérdida de potencia",
    Withdrew: "Retirado", "Did not qualify": "No clasificó", Spun: "Trompo", Puncture: "Pinchazo", Electrical: "Falla eléctrica",
  })[s] || s;
}

const COUNTRY_ES = {
  Japan: "Japón", Bahrain: "Baréin", "Saudi Arabia": "Arabia Saudita", USA: "Estados Unidos", "United States": "Estados Unidos",
  Italy: "Italia", Monaco: "Mónaco", Spain: "España", Canada: "Canadá", "Great Britain": "Gran Bretaña", UK: "Reino Unido",
  "United Kingdom": "Reino Unido", Belgium: "Bélgica", Hungary: "Hungría", Netherlands: "Países Bajos", Azerbaijan: "Azerbaiyán",
  Singapore: "Singapur", Mexico: "México", Brazil: "Brasil", Qatar: "Catar", "United Arab Emirates": "Emiratos Árabes Unidos",
  "Abu Dhabi": "Abu Dabi", France: "Francia", Germany: "Alemania", Russia: "Rusia", Turkey: "Turquía", Türkiye: "Turquía",
};
const PLACE_ES = { "Mexico City": "Ciudad de México", Monaco: "Mónaco", "Monte Carlo": "Montecarlo", Jeddah: "Yeda", Montréal: "Montreal", "Yas Island": "Isla Yas", "Yas Marina": "Yas Marina" };
const GP_ES = {
  Australian: "de Australia", Chinese: "de China", Japanese: "de Japón", Bahrain: "de Baréin", "Saudi Arabian": "de Arabia Saudita",
  Miami: "de Miami", "Emilia Romagna": "de Emilia-Romaña", Monaco: "de Mónaco", Spanish: "de España", Barcelona: "de Barcelona",
  Madrid: "de Madrid", Canadian: "de Canadá", Austrian: "de Austria", British: "de Gran Bretaña", Belgian: "de Bélgica",
  Hungarian: "de Hungría", Dutch: "de los Países Bajos", Italian: "de Italia", Azerbaijan: "de Azerbaiyán", Singapore: "de Singapur",
  "United States": "de Estados Unidos", "Mexico City": "de la Ciudad de México", Mexican: "de México", "São Paulo": "de São Paulo",
  Brazilian: "de Brasil", "Las Vegas": "de Las Vegas", Qatar: "de Catar", "Abu Dhabi": "de Abu Dabi", French: "de Francia",
  Portuguese: "de Portugal", Russian: "de Rusia", Turkish: "de Turquía", Styrian: "de Estiria", Tuscan: "de la Toscana",
  Eifel: "de Eifel", Sakhir: "de Sakhir", German: "de Alemania", "70th Anniversary": "del 70.º Aniversario",
};
function gpEs(name) {
  const m = (name || "").match(/^(.*) Grand Prix$/);
  return m ? `Gran Premio ${GP_ES[m[1]] || `de ${m[1]}`}` : name;
}
const countryEs = (c) => COUNTRY_ES[c] || c;
const placeEs = (c) => PLACE_ES[c] || c;

const RC_CAT_ES = { Flag: "Bandera", SafetyCar: "Auto de seguridad", SessionStatus: "Sesión", Drs: "DRS", CarEvent: "Auto", Other: "Aviso" };
// Mensajes completos de Dirección de Carrera (vienen en mayúsculas)
const RC_RULES = [
  [/^GREEN LIGHT - PIT EXIT OPEN$/, "Luz verde: salida de pits abierta"],
  [/^PIT EXIT CLOSED$/, "Salida de pits cerrada"],
  [/^PIT ENTRY CLOSED$/, "Entrada a pits cerrada"],
  [/^DOUBLE YELLOW IN TRACK SECTOR (\d+)$/, "Doble bandera amarilla en el sector $1"],
  [/^YELLOW IN TRACK SECTOR (\d+)$/, "Bandera amarilla en el sector $1"],
  [/^CLEAR IN TRACK SECTOR (\d+)$/, "Sector $1 despejado"],
  [/^TRACK CLEAR$/, "Pista despejada"],
  [/^RED FLAG - RACE SUSPENDED$/, "Bandera roja: carrera suspendida"],
  [/^RED FLAG$/, "Bandera roja"],
  [/^CHEQUERED FLAG$/, "Bandera a cuadros"],
  [/^(?:VSC|VIRTUAL SAFETY CAR) DEPLOYED$/, "Auto de seguridad virtual (VSC) activado"],
  [/^(?:VSC|VIRTUAL SAFETY CAR) ENDING$/, "Termina el auto de seguridad virtual (VSC)"],
  [/^SAFETY CAR DEPLOYED$/, "Auto de seguridad en pista"],
  [/^SAFETY CAR IN THIS LAP$/, "El auto de seguridad entra en esta vuelta"],
  [/^SAFETY CAR THROUGH THE PIT LANE$/, "El auto de seguridad pasa por los pits"],
  [/^LAPPED CARS MAY OVERTAKE$/, "Los autos doblados pueden adelantar"],
  [/^LAPPED CARS WILL NOT BE ALLOWED TO OVERTAKE$/, "Los autos doblados no podrán adelantar"],
  [/^SESSION STARTED$/, "Sesión iniciada"],
  [/^SESSION FINISHED$/, "Sesión finalizada"],
  [/^SESSION ABORTED$/, "Sesión interrumpida"],
  [/^STANDING START$/, "Largada detenida"],
  [/^ROLLING START$/, "Largada lanzada"],
  [/^DRS ENABLED$/, "DRS habilitado"],
  [/^DRS DISABLED$/, "DRS deshabilitado"],
  [/^RACE WILL RESUME AT (.+)$/, "La carrera se reanuda a las $1"],
  [/^REVISED RESUMPTION ORDER: (.+)$/, "Orden de reanudación corregido: $1"],
  [/^RESUMPTION ORDER: (.+)$/, "Orden de reanudación: $1"],
  [/^ALL PASS HOLDERS MAY ACCESS THE PIT LANE$/, "Todos los acreditados pueden entrar al pit lane"],
  [/^WAVED BLUE FLAG FOR CAR (\d+) \((\w+)\) TIMED AT (.+)$/, "Bandera azul para el auto $1 ($2) a las $3"],
  [/^CAR (\d+) \((\w+)\) TIME (\S+) DELETED - TRACK LIMITS AT TURN (\d+) LAP (\d+) (.+)$/,
    "Tiempo de $3 del auto $1 ($2) anulado por límites de pista en la curva $4, vuelta $5 ($6)"],
  [/^BLACK AND WHITE FLAG FOR CAR (\d+) \((\w+)\) - (.+)$/, "Bandera blanca y negra para el auto $1 ($2): $3"],
];
// Frases sueltas para los mensajes de comisarios e incidentes
const RC_PHRASES = [
  [/FIA STEWARDS:/g, "Comisarios FIA:"],
  [/(\d+) SECOND TIME PENALTY FOR CAR/g, "penalización de $1 s para el auto"],
  [/DRIVE THROUGH PENALTY FOR CAR/g, "drive-through para el auto"],
  [/STOP AND GO PENALTY FOR CAR/g, "stop and go para el auto"],
  [/TURN (\d+) INCIDENT INVOLVING CARS/g, "incidente en la curva $1 entre los autos"],
  [/TURN (\d+) INCIDENT INVOLVING CAR/g, "incidente en la curva $1 con el auto"],
  [/LAP (\d+) TURN (\d+) INCIDENT/g, "incidente en la vuelta $1, curva $2"],
  [/INCIDENT INVOLVING CARS/g, "incidente entre los autos"],
  [/INCIDENT INVOLVING CAR/g, "incidente con el auto"],
  [/REVIEWED NO FURTHER INVESTIGATION/g, "revisado, sin más investigación"],
  [/WILL BE INVESTIGATED AFTER THE RACE/g, "se investigará después de la carrera"],
  [/UNDER INVESTIGATION/g, "bajo investigación"],
  [/NO FURTHER ACTION/g, "sin sanción"],
  [/NOTED/g, "anotado"],
  [/SPEEDING IN THE PIT LANE/g, "exceso de velocidad en pits"],
  [/LEAVING PIT EXIT ON RED LIGHT/g, "salir de pits con luz roja"],
  [/LEAVING THE TRACK AND GAINING AN ADVANTAGE/g, "salirse de la pista y ganar ventaja"],
  [/FORCING ANOTHER DRIVER OFF THE TRACK/g, "sacar a otro piloto de la pista"],
  [/CAUSING A COLLISION/g, "provocar un choque"],
  [/UNSAFE RELEASE/g, "liberación insegura"],
  [/TRACK LIMITS/g, "límites de pista"],
  [/IMPEDING/g, "obstaculizar"],
  [/FALSE START/g, "largada en falso"],
  [/ - /g, ": "],
  [/ AND /g, " y "],
];
function rcEs(msg) {
  const s = String(msg || "");
  for (const [re, out] of RC_RULES) if (re.test(s)) return s.replace(re, out);
  let r = s;
  for (const [re, out] of RC_PHRASES) r = r.replace(re, out);
  return r;
}

const SESSION_ES = {
  Race: "Carrera", Qualifying: "Clasificación", Sprint: "Sprint", "Sprint Qualifying": "Clasificación Sprint",
  "Sprint Shootout": "Sprint Shootout", "Practice 1": "Libres 1", "Practice 2": "Libres 2", "Practice 3": "Libres 3",
};

const S = {
  d: null, t: 0, tEnd: 0, playing: false, speed: 4, sel: null, gapMode: "gap", tab: "laps",
  chips: new Set(), charts: {}, dragging: false, byNum: {}, view: null, layer: null, cars: [],
  cmpA: null, cmpB: null, msgCount: -1, slowFilter: true, session: 0,
  chunks: new Map(), loadingChunks: new Set(), failedAt: {}, fastest: {},
};

/* ---------------------------------------------------------------- formato */
function fmtLap(s) {
  if (s == null) return "–";
  const m = Math.floor(s / 60), r = s - m * 60;
  return m ? `${m}:${r.toFixed(3).padStart(6, "0")}` : r.toFixed(3);
}
function fmtClock(s) {
  s = Math.max(0, Math.floor(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return (h ? `${h}:${String(m).padStart(2, "0")}` : `${m}`) + `:${String(x).padStart(2, "0")}`;
}
const hex2rgba = (h, a) => {
  const n = parseInt(h.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

/* --------------------------------------------------------- selector de sesión */
/* Modo estático (GitHub Pages): no hay servidor, se leen archivos JSON generados por
   export_static.py. Con el servidor Flask se usan las rutas /api/. */
const STATIC = !!window.F1_STATIC;
const slug = (s) => s.replace(/ /g, "_");
const API = {
  schedule: (y) => (STATIC ? `data/schedule/${y}.json` : `/api/schedule/${y}`),
  session: (y, r, s) => (STATIC ? `data/replay/${y}/${r}/${slug(s)}` : `/api/replay/${y}/${r}/${encodeURIComponent(s)}`),
  base: (url) => (STATIC ? `${url}/base.json` : url),
  chunk: (url, k) => (STATIC ? `${url}/chunk/${k}.json` : `${url}/chunk/${k}`),
  fastest: (url, n) => (STATIC ? `${url}/fastest/${n}.json` : `${url}/fastest/${n}`),
};

const yearSel = $("#year"), eventSel = $("#event"), sessionSel = $("#session");
let schedule = [];

async function initPicker() {
  const now = new Date().getFullYear();
  let years = [];
  if (STATIC) {
    try { years = await (await fetch("data/years.json")).json(); } catch { years = []; }
  } else {
    for (let y = now; y >= 2018; y--) years.push(y);
  }
  for (const y of years) yearSel.add(new Option(y, y));
  const [y, r, s] = decodeURIComponent(location.hash.slice(1)).split("/");
  yearSel.value = years.includes(+y) ? y : years[0] ?? now;
  loadSchedule(r ? { round: +r, session: s } : null).then(() => { if (r && s) loadReplay(); });
  yearSel.onchange = () => loadSchedule();
  eventSel.onchange = () => fillSessions();
  $("#picker").onsubmit = (e) => { e.preventDefault(); loadReplay(); };
}

async function loadSchedule(pick) {
  eventSel.innerHTML = "<option>Cargando calendario…</option>";
  sessionSel.innerHTML = "";
  try {
    const r = await fetch(API.schedule(yearSel.value));
    const j = await r.json();
    if (!r.ok) throw new Error(j.error);
    schedule = j.events;
  } catch (e) {
    eventSel.innerHTML = "<option>Error al cargar el calendario</option>";
    return;
  }
  const hasPast = (e) => e.sessions.some((s) => s.past);
  eventSel.innerHTML = schedule.map((e) =>
    `<option value="${e.round}" ${hasPast(e) ? "" : "disabled"}>R${e.round} · ${esc(e.name)}</option>`).join("");
  const past = schedule.filter(hasPast);
  eventSel.value = pick?.round && schedule.some((e) => e.round === pick.round) ? pick.round : past.at(-1)?.round ?? schedule[0]?.round;
  fillSessions(pick?.session);
}

function fillSessions(pick) {
  const ev = schedule.find((e) => e.round == eventSel.value);
  if (!ev) return;
  sessionSel.innerHTML = ev.sessions.map((s) =>
    `<option value="${esc(s.name)}" ${s.past ? "" : "disabled"}>${esc(SESSION_ES[s.name] || s.name)}${s.recent ? " · en curso o recién terminada" : ""}</option>`).join("");
  const past = ev.sessions.filter((s) => s.past);
  sessionSel.value = past.some((s) => s.name === pick) ? pick : (past.find((s) => s.name === "Race") || past.at(-1) || ev.sessions[0]).name;
}

async function loadReplay() {
  const y = yearSel.value, r = eventSel.value, s = sessionSel.value;
  if (!s) return;
  history.replaceState(null, "", `#${y}/${r}/${encodeURIComponent(s)}`);
  setPlaying(false);
  const session = ++S.session; // descarta respuestas de una sesión anterior si el usuario cambia
  $("#empty").hidden = true; $("#app").hidden = true; $("#error").hidden = true; $("#loading").hidden = false;
  try {
    const url = API.session(y, r, s);
    const res = await fetch(API.base(url));
    const j = await res.json();
    if (session !== S.session) return;
    if (res.status === 401) return showAuthHelp(j.auth);
    if (res.status === 404 && /F1TV/.test(j.error || "")) {
      return showError(`<h2>No hay datos sin cuenta para esta sesión</h2><p>${esc(j.error)}</p>
        <button class="btn-primary" onclick="openAuth()">Conectar cuenta F1TV</button>`);
    }
    if (!res.ok) throw new Error(j.error || res.statusText);
    $("#loading").hidden = true; $("#app").hidden = false;
    S.url = url;
    init(j);
  } catch (e) {
    showError(`<h2>No se pudo cargar la sesión</h2><p>${esc(e.message)}</p>`);
  }
}

/* --------------------------------------------- tramos de posiciones bajo demanda */
const MAX_PARALLEL = 2;

// Pide el tramo actual y los siguientes, antes de que la reproducción llegue a ellos
function ensureChunks() {
  const tl = S.d.timeline, k = Math.floor(frameAt(S.t)[0] / tl.chunk);
  const ahead = S.speed >= 16 ? 3 : 2;
  for (let j = k; j <= Math.min(tl.nchunks - 1, k + ahead); j++) loadChunk(j, j === k);
}

async function loadChunk(k, urgent) {
  if (S.chunks.has(k) || S.loadingChunks.has(k)) return;
  if (!urgent && (S.loadingChunks.size >= MAX_PARALLEL || S.failedAt[k] > performance.now() - 5000)) return;
  const session = S.session;
  S.loadingChunks.add(k);
  try {
    const res = await fetch(API.chunk(S.url, k));
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || res.statusText);
    if (session !== S.session) return;
    S.chunks.set(k, j);
    drawStatusStrip();
  } catch (e) {
    S.failedAt[k] = performance.now(); // se reintenta a los 5 s
    S.chunkError = e.message;
  } finally {
    if (session === S.session) S.loadingChunks.delete(k);
  }
}

const chunkReady = (i) => S.chunks.has(Math.floor(i / S.d.timeline.chunk));

function showError(html) {
  $("#loading").hidden = true;
  const el = $("#error");
  el.innerHTML = html;
  el.hidden = false;
}

function showAuthHelp(auth) {
  const why = auth?.reason === "expired" ? "Tu sesión de F1TV expiró." : "Esta sesión necesita una cuenta F1TV.";
  showError(`<h2>Se necesita una cuenta F1TV</h2>
    <p>${why} Desde 2026, Fórmula 1 exige una suscripción F1TV activa para el cronometraje oficial que usa FastF1.</p>
    <button class="btn-primary" onclick="openAuth()">Conectar cuenta F1TV</button>`);
}

/* ----------------------------------------------------------------- cuenta F1TV */
const authDlg = $("#auth-dlg");
let authState = { ok: false };

async function refreshAuth() {
  try { authState = await (await fetch("/api/auth")).json(); } catch { authState = { ok: false }; }
  $("#auth-btn .dot").classList.toggle("on", !!authState.ok);
  $("#auth-btn").title = authState.ok ? "Cuenta F1TV conectada" : "Conectar cuenta F1TV";
  $("#auth-on").hidden = !authState.ok;
  $("#auth-form").hidden = !!authState.ok;
  if (authState.ok) {
    const exp = new Date(authState.expires * 1000).toLocaleString("es-CL", { dateStyle: "medium", timeStyle: "short" });
    $("#auth-info").textContent = `Conectada${authState.subscription ? ` (${authState.subscription})` : ""} · el acceso vence el ${exp}`;
  }
}

function authMsg(text, ok) {
  const el = $("#auth-msg");
  el.hidden = !text;
  el.textContent = text || "";
  el.classList.toggle("ok", !!ok);
}

function openAuth() {
  authMsg("");
  refreshAuth();
  authDlg.showModal();
}

// al cambiar de fuente de datos, la sesión abierta se vuelve a cargar con la nueva
function afterAuthChange(text) {
  authMsg(text, true);
  refreshAuth();
  if (S.d) loadReplay();
}

$("#auth-btn").onclick = openAuth;
$("#auth-close").onclick = () => authDlg.close();
$("#auth-form").onsubmit = async (e) => {
  e.preventDefault();
  const btn = $("#auth-submit"), pass = $("#auth-pass");
  btn.disabled = true; btn.textContent = "Conectando con Fórmula 1…";
  authMsg("");
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: $("#auth-email").value, password: pass.value }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || res.statusText);
    afterAuthChange("Listo: cuenta conectada. Ahora se usa el cronometraje oficial de FastF1.");
  } catch (err) {
    authMsg(err.message);
  } finally {
    pass.value = ""; // la contraseña no se queda en la página
    btn.disabled = false; btn.textContent = "Iniciar sesión";
  }
};
$("#auth-logout").onclick = async () => {
  await fetch("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  afterAuthChange("Sesión cerrada. Se vuelve a usar OpenF1.");
};

/* ------------------------------------------------------------- inicialización */
function init(d) {
  S.d = d;
  S.byNum = Object.fromEntries(d.drivers.map((x, i) => [x.num, i]));
  const tl = d.timeline;
  S.t = tl.t0;
  S.tEnd = tl.t0 + (tl.n - 1) * tl.step;
  S.sel = (d.drivers.find((x) => x.pos === 1) || d.drivers[0]).num;
  const ranked = [...d.drivers].sort((a, b) => (a.pos ?? 99) - (b.pos ?? 99));
  S.chips = new Set(ranked.slice(0, 5).map((x) => x.num));
  S.cmpA = ranked[0]?.num; S.cmpB = ranked[1]?.num;
  S.msgCount = -1;
  S.chunks = new Map(); S.loadingChunks = new Set(); S.failedAt = {}; S.chunkError = null;
  S.fastest = {};

  // ventanas de paso por boxes
  S.pits = {};
  for (const x of d.drivers) {
    const L = d.laps[x.num] || [], w = [];
    L.forEach((l, i) => { if (l.pin != null) w.push([l.pin, L[i + 1]?.pout ?? l.pin + 30]); });
    S.pits[x.num] = w;
  }

  const meta = d.meta;
  $("#hero-sub").textContent = `${meta.year} · Ronda ${meta.round} · ${meta.location}, ${meta.country} · Datos: ${meta.source}`;
  $("#hero-title").textContent = `${meta.event} — ${SESSION_ES[meta.session] || meta.session}`;
  $("#hud-lap-label").textContent = meta.isRace ? "VUELTA" : "TIEMPO";
  $("#scrub").max = S.tEnd - tl.t0;
  $$("#gap-mode button")[0].textContent = meta.isRace ? "Líder" : "Mejor";

  for (const c of Object.values(S.charts)) c.destroy();
  S.charts = {};
  $("#board-rows").innerHTML = "";
  S.rows = {};
  resize();
  drawStatusStrip();
  renderTab();
  ensureChunks();
  updateUi(true);
}

/* ------------------------------------------------------------------ fotogramas */
function frameAt(t) {
  const tl = S.d.timeline;
  let f = (t - tl.t0) / tl.step;
  f = Math.max(0, Math.min(tl.n - 1.000001, f));
  const i = Math.floor(f);
  return [i, f - i];
}
// Valor de un campo de un piloto en el fotograma global i (null si su tramo aún no llega)
function fv(num, key, i) {
  const c = S.chunks.get(Math.floor(i / S.d.timeline.chunk));
  return c ? c.frames[num]?.[key]?.[i - c.start] ?? null : null;
}
function orderAt(i) {
  const c = S.chunks.get(Math.floor(i / S.d.timeline.chunk));
  return c ? c.order[i - c.start] : null;
}
function lerp(num, key, i, a) {
  const v0 = fv(num, key, i);
  const v1 = chunkReady(i + 1) ? fv(num, key, i + 1) : v0; // el tramo siguiente puede no haber llegado
  if (v0 == null) return a > 0.5 ? v1 ?? null : null;
  if (v1 == null) return a <= 0.5 ? v0 : null;
  return v0 + (v1 - v0) * a;
}
function nearest(num, key, i, a) { return (a < 0.5 ? null : fv(num, key, i + 1)) ?? fv(num, key, i); }
function lastBefore(list, t, key = "t") {
  let lo = 0, hi = list.length - 1, r = null;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (list[m][key] != null && list[m][key] <= t) { r = list[m]; lo = m + 1; } else hi = m - 1;
  }
  return r;
}

/* ----------------------------------------------------------------- dibujo pista */
const cv = $("#track"), ctx = cv.getContext("2d");
let DPR = 1;

function resize() {
  if (!S.d) return;
  DPR = window.devicePixelRatio || 1;
  cv.width = Math.round(cv.clientWidth * DPR);
  cv.height = Math.round(cv.clientHeight * DPR);
  const { x, y } = S.d.track;
  const xs = x.filter((v) => v != null), ys = y.filter((v) => v != null);
  const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
  const padX = 70 * DPR, padY = 50 * DPR;
  const sc = Math.min((cv.width - 2 * padX) / (maxx - minx), (cv.height - 2 * padY) / (maxy - miny));
  const ox = (cv.width - (maxx - minx) * sc) / 2, oy = (cv.height - (maxy - miny) * sc) / 2;
  S.view = { map: (X, Y) => [ox + (X - minx) * sc, cv.height - (oy + (Y - miny) * sc)], sc };
  buildLayer();
  drawStatusStrip();
}

function speedColor(v, lo, hi) {
  const t = Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
  const stops = [[48, 99, 255], [0, 210, 190], [255, 214, 0], [255, 40, 40]];
  const p = t * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(p)), f = p - i;
  const c = stops[i].map((a, k) => Math.round(a + (stops[i + 1][k] - a) * f));
  return `rgb(${c})`;
}

function buildLayer() {
  const L = document.createElement("canvas");
  L.width = cv.width; L.height = cv.height;
  const g = L.getContext("2d");
  const { x, y, spd, corners, rotation } = S.d.track;
  const pts = x.map((v, i) => S.view.map(v, y[i]));
  const path = () => { g.beginPath(); pts.forEach(([a, b], i) => (i ? g.lineTo(a, b) : g.moveTo(a, b))); };
  g.lineJoin = g.lineCap = "round";
  path(); g.strokeStyle = "#1c2130"; g.lineWidth = 20 * DPR; g.stroke();
  path(); g.strokeStyle = "#2c3344"; g.lineWidth = 13 * DPR; g.stroke();
  if ($("#opt-speed").checked) {
    const v = spd.filter((s) => s != null), lo = Math.min(...v), hi = Math.max(...v);
    g.lineWidth = 6 * DPR;
    for (let i = 1; i < pts.length; i++) {
      g.beginPath(); g.moveTo(...pts[i - 1]); g.lineTo(...pts[i]);
      g.strokeStyle = speedColor(spd[i], lo, hi); g.stroke();
    }
    g.font = `${11 * DPR}px Titillium Web`; g.fillStyle = "#8a93a6"; g.textAlign = "left";
    const gx = 18 * DPR, gy = cv.height - 22 * DPR, gw = 140 * DPR;
    const grad = g.createLinearGradient(gx, 0, gx + gw, 0);
    [0, 0.33, 0.66, 1].forEach((s) => grad.addColorStop(s, speedColor(lo + s * (hi - lo), lo, hi)));
    g.fillStyle = grad; g.fillRect(gx, gy, gw, 6 * DPR);
    g.fillStyle = "#8a93a6";
    g.fillText(`${lo} km/h`, gx, gy - 4 * DPR); g.textAlign = "right"; g.fillText(`${hi} km/h`, gx + gw, gy - 4 * DPR);
  } else {
    path(); g.strokeStyle = "#5b6479"; g.lineWidth = 2 * DPR; g.stroke();
  }
  // línea de meta
  const [ax, ay] = pts[0], [bx, by] = pts[Math.min(3, pts.length - 1)];
  const ang = Math.atan2(by - ay, bx - ax) + Math.PI / 2;
  g.save(); g.translate(ax, ay); g.rotate(ang);
  for (let k = -3; k < 3; k++) for (let j = 0; j < 2; j++) {
    g.fillStyle = (k + j) % 2 ? "#fff" : "#111";
    g.fillRect(k * 3.5 * DPR, (j - 1) * 3.5 * DPR, 3.5 * DPR, 3.5 * DPR);
  }
  g.restore();
  // curvas
  if ($("#opt-corners").checked && corners?.length) {
    g.font = `600 ${10 * DPR}px Titillium Web`; g.textAlign = "center"; g.textBaseline = "middle";
    for (const c of corners) {
      const a = ((c.a ?? 0) + rotation) * Math.PI / 180;
      const [cx, cy] = S.view.map(c.x + Math.cos(a) * 600, c.y + Math.sin(a) * 600);
      g.fillStyle = "#1c2130"; g.beginPath(); g.arc(cx, cy, 9 * DPR, 0, 7); g.fill();
      g.fillStyle = "#8a93a6"; g.fillText(c.n, cx, cy + 0.5);
    }
  }
  S.layer = L;
}

function drawTrack() {
  ctx.clearRect(0, 0, cv.width, cv.height);
  if (S.layer) ctx.drawImage(S.layer, 0, 0);
  const d = S.d, [i, a] = frameAt(S.t);
  const order = orderAt(i);
  S.cars = [];
  if (!order) return; // el tramo aún no llega: se ve solo la pista
  const labels = $("#opt-labels").checked;
  ctx.font = `700 ${11 * DPR}px Titillium Web`; ctx.textBaseline = "middle"; ctx.textAlign = "left";
  for (let k = order.length - 1; k >= 0; k--) {
    const drv = d.drivers[order[k]];
    const X = lerp(drv.num, "x", i, a), Y = lerp(drv.num, "y", i, a);
    if (X == null || Y == null) continue;
    const [px, py] = S.view.map(X, Y), sel = drv.num === S.sel;
    S.cars.push({ num: drv.num, px, py });
    if (sel) {
      ctx.beginPath(); ctx.arc(px, py, 13 * DPR, 0, 7); ctx.fillStyle = hex2rgba(drv.color, 0.25); ctx.fill();
      ctx.lineWidth = 2 * DPR; ctx.strokeStyle = "#fff"; ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(px, py, (sel ? 8 : 6.5) * DPR, 0, 7);
    ctx.fillStyle = drv.color; ctx.fill();
    ctx.lineWidth = 2 * DPR; ctx.strokeStyle = "#0b0d12"; ctx.stroke();
    if (labels || sel) {
      const tx = px + 11 * DPR;
      ctx.lineWidth = 3 * DPR; ctx.strokeStyle = "#0b0d12"; ctx.strokeText(drv.abbr, tx, py);
      ctx.fillStyle = sel ? "#fff" : "#c9cfdb"; ctx.fillText(drv.abbr, tx, py);
    }
  }
}

cv.addEventListener("click", (e) => {
  const r = cv.getBoundingClientRect();
  const x = (e.clientX - r.left) * DPR, y = (e.clientY - r.top) * DPR;
  let best = null, bd = (18 * DPR) ** 2;
  for (const c of S.cars) {
    const dd = (c.px - x) ** 2 + (c.py - y) ** 2;
    if (dd < bd) { bd = dd; best = c; }
  }
  if (best) select(best.num);
});

/* franja de estado de pista bajo la línea de tiempo */
function drawStatusStrip() {
  const c = $("#status-strip");
  if (!S.d) return;
  c.width = c.clientWidth * DPR; c.height = 6 * DPR;
  const g = c.getContext("2d"), st = S.d.status, t0 = S.d.timeline.t0, span = S.tEnd - t0;
  g.fillStyle = "#1c2130"; g.fillRect(0, 0, c.width, c.height);
  // tramos ya descargados, como el búfer de un reproductor de video
  const tl = S.d.timeline;
  g.fillStyle = "#3a4256";
  for (const k of S.chunks.keys()) {
    const a = (k * tl.chunk) / (tl.n - 1), b = Math.min(1, ((k + 1) * tl.chunk) / (tl.n - 1));
    g.fillRect(a * c.width, 0, Math.ceil((b - a) * c.width), c.height);
  }
  st.forEach((s, k) => {
    if (s.s === "1" || !TRACK_STATUS[s.s]) return;
    const a = Math.max(0, (s.t - t0) / span), b = Math.min(1, ((st[k + 1]?.t ?? S.tEnd) - t0) / span);
    if (b <= 0 || a >= 1) return;
    g.fillStyle = TRACK_STATUS[s.s].c;
    g.fillRect(a * c.width, 0, Math.max(2, (b - a) * c.width), c.height);
  });
}

/* ------------------------------------------------------------------ interfaz */
function currentLapOf(num, t) {
  return (S.d.laps[num] || []).find((l) => l.start != null && l.start <= t && (l.end == null || l.end > t)) || null;
}
function lastDoneLap(num, t) {
  const L = S.d.laps[num] || [];
  let r = null;
  for (const l of L) if (l.end != null && l.end <= t) r = l;
  return r;
}
const inPit = (num, t) => S.pits[num].some(([a, b]) => t >= a && t <= b);
const isOut = (drv, t) => S.d.meta.isRace && t > drv.lastEnd + 20 && !/Finished|Lap/i.test(drv.status || "");

function updateUi(force) {
  const d = S.d, t = S.t, [i, a] = frameAt(t);
  const order = orderAt(i);
  const buf = $("#hud-buffer");
  buf.hidden = !!order;
  if (!order) buf.lastElementChild.textContent = S.failedAt[Math.floor(i / d.timeline.chunk)] && S.chunkError
    ? `No se pudo cargar este tramo; reintentando… (${S.chunkError})` : "Cargando este tramo de la sesión…";

  // HUD
  if (d.meta.isRace) {
    const lap = order ? nearest(d.drivers[order[0]].num, "lap", i, a) : currentLapOf(d.meta.fastest.num, t)?.n;
    $("#hud-lap").textContent = `${Math.max(1, Math.min(lap ?? 1, d.meta.totalLaps))}/${d.meta.totalLaps}`;
  } else {
    $("#hud-lap").textContent = fmtClock(t - d.timeline.t0);
  }
  $("#hud-clock").textContent = d.meta.isRace ? fmtClock(t - d.timeline.t0) : "";
  const st = lastBefore(d.status, t);
  const ts = TRACK_STATUS[st?.s] || TRACK_STATUS["1"];
  const hs = $("#hud-status");
  hs.textContent = ts.t; hs.style.background = ts.c; hs.style.color = ts.fg;
  $("#track-card").style.borderTopColor = ts.c;
  if (!S.dragging) $("#scrub").value = t - d.timeline.t0;
  $("#time-label").textContent = `${fmtClock(t - d.timeline.t0)} / ${fmtClock(S.tEnd - d.timeline.t0)}`;

  // clima
  const w = lastBefore(d.weather, t) || d.weather[0];
  $("#weather-now").innerHTML = w ? [
    ["Aire", `${w.air}°`], ["Pista", `${w.track}°`], ["Humedad", `${Math.round(w.hum)}%`],
    ["Viento", `${w.wind} m/s`], ["Lluvia", w.rain ? "Sí" : "No", w.rain ? "rain" : ""],
  ].map(([l, v, c]) => `<div class="wchip ${c || ""}"><b>${v}</b><span>${l}</span></div>`).join("") : "";

  if (order) { // sin tramo se mantiene la última clasificación mostrada
    renderBoard(order, i, a);
    renderDriver(i, a, order);
  }
  if (S.tab === "weather") renderMessages();
}

function gapText(drv, k, order, i, a) {
  const d = S.d, n = drv.num;
  if (!d.meta.isRace) {
    const best = nearest(n, "best", i, a);
    if (best == null) return ["Sin tiempo", false];
    if (k === 0) return [fmtLap(best), true];
    const ref = d.drivers[S.gapMode === "gap" ? order[0] : order[k - 1]].num;
    return [`+${(best - nearest(ref, "best", i, a)).toFixed(3)}`, false];
  }
  if (k === 0) return ["LÍDER", true];
  const toLeader = S.gapMode === "gap";
  if (fv(n, "down", i) != null) { // cronometraje oficial (OpenF1)
    const down = nearest(n, toLeader ? "down" : "idown", i, a);
    if (down >= 1) return [`+${down} V`, false];
    const g = nearest(n, toLeader ? "gap" : "int", i, a);
    if (g != null) return [`+${g.toFixed(3)}`, false];
  }
  const ref = d.drivers[toLeader ? order[0] : order[k - 1]].num;
  const down = Math.floor((lerp(ref, "prog", i, a) ?? 0) - (lerp(n, "prog", i, a) ?? 0));
  if (down >= 1) return [`+${down} V`, false];
  let g = lerp(n, "gap", i, a);
  if (g != null && !toLeader) g -= lerp(ref, "gap", i, a) ?? 0;
  return g == null ? ["–", false] : [`+${Math.max(0, g).toFixed(1)}`, false];
}

function renderBoard(order, i, a) {
  const d = S.d, box = $("#board-rows");
  order.forEach((idx, k) => {
    const drv = d.drivers[idx];
    let row = S.rows[drv.num];
    if (!row) {
      row = document.createElement("div");
      row.className = "row";
      row.innerHTML = `<span class="p"></span><span class="bar" style="background:${drv.color}"></span>
        <span class="ab"></span><span class="delta"></span><span class="tyre"></span><span class="gap"></span>`;
      row.onclick = () => select(drv.num);
      S.rows[drv.num] = row;
    }
    if (box.children[k] !== row) box.insertBefore(row, box.children[k] || null);
    const out = isOut(drv, S.t), pit = !out && inPit(drv.num, S.t);
    const drs = nearest(drv.num, "drs", i, a);
    row.classList.toggle("sel", drv.num === S.sel);
    row.classList.toggle("out", out);
    row.children[0].textContent = k + 1;
    row.children[2].innerHTML = `${esc(drv.abbr)}${out ? '<span class="tag out">OUT</span>' : pit ? '<span class="tag">PIT</span>' : drs ? '<span class="tag drs">DRS</span>' : ""}`;
    const dl = row.children[3];
    if (d.meta.isRace && drv.grid) {
      const delta = drv.grid - (k + 1);
      dl.textContent = delta > 0 ? `▲${delta}` : delta < 0 ? `▼${-delta}` : "";
      dl.className = `delta ${delta > 0 ? "up" : "down"}`;
    } else dl.textContent = "";
    const lap = currentLapOf(drv.num, S.t) || lastDoneLap(drv.num, S.t);
    const cmp = lap?.cmp;
    const ty = row.children[4];
    ty.style.setProperty("--c", COMPOUND[cmp] || "#555");
    ty.textContent = CMP_LETTER[cmp] || "?";
    ty.title = cmp ? `${cmp} · ${lap.life ?? "?"} vueltas` : "";
    const [txt, lead] = out ? ["OUT", false] : gapText(drv, k, order, i, a);
    row.children[5].textContent = txt;
    row.children[5].classList.toggle("lead", lead);
  });
}

function select(num) {
  S.sel = num;
  S.chips.add(num);
  updateUi(true);
  if (["laps", "pos"].includes(S.tab)) renderTab();
}

function renderDriver(i, a, order) {
  const d = S.d, drv = d.drivers[S.byNum[S.sel]], n = drv.num, t = S.t;
  const el = $("#driver-panel");
  el.style.setProperty("--team", drv.color);
  if (el.dataset.num !== drv.num) {
    el.dataset.num = drv.num;
    el.innerHTML = `<div>
        <div class="dp-id">${drv.headshot ? `<img src="${esc(drv.headshot)}" alt="">` : ""}
          <div><div class="dp-name">${esc(drv.name)}</div><div class="dp-team">${esc(drv.team)} · #${esc(drv.num)}</div></div></div>
        <div class="dp-pos" id="dp-pos"></div>
      </div>
      <div class="gauges">
        <div class="g"><div class="l">Velocidad</div><div class="v" id="g-spd"></div><div class="meter"><i id="m-spd" style="background:#3d8bff"></i></div></div>
        <div class="g"><div class="l">Marcha</div><div class="v" id="g-gear"></div><div><span class="drs-badge" id="g-drs">DRS</span></div></div>
        <div class="g"><div class="l">RPM</div><div class="v" id="g-rpm"></div><div class="meter"><i id="m-rpm" style="background:#b145ff"></i></div></div>
        <div class="g"><div class="l">Acelerador</div><div class="v" id="g-thr"></div><div class="meter"><i id="m-thr" style="background:#1fbf5f"></i></div></div>
        <div class="g"><div class="l">Freno</div><div class="v" id="g-brk"></div><div class="meter"><i id="m-brk" style="background:#ff2d2d"></i></div></div>
        <div class="g"><div class="l">Neumático</div><div class="v" id="g-tyre"></div></div>
        <div class="g"><div class="l">Última vuelta</div><div class="v" id="g-last" style="font-size:20px"></div><div class="sectors" id="g-sec"></div></div>
        <div class="g"><div class="l">Mejor vuelta</div><div class="v" id="g-best" style="font-size:20px"></div><div class="l" id="g-stops" style="margin-top:6px"></div></div>
      </div>`;
  }
  const k = order.indexOf(S.byNum[drv.num]);
  const out = isOut(drv, t);
  $("#dp-pos").innerHTML = `P${k + 1}<small>${out ? "Abandono" : d.meta.isRace && drv.grid ? `salió P${drv.grid}` : ""}</small>`;
  const spd = lerp(n, "spd", i, a), rpm = lerp(n, "rpm", i, a), thr = lerp(n, "thr", i, a), brk = nearest(n, "brk", i, a);
  $("#g-spd").innerHTML = `${spd == null ? "–" : Math.round(spd)}<small>km/h</small>`;
  $("#m-spd").style.width = `${Math.min(100, (spd ?? 0) / 3.5)}%`;
  $("#g-gear").textContent = nearest(n, "gear", i, a) ?? "–";
  $("#g-drs").classList.toggle("on", !!nearest(n, "drs", i, a));
  $("#g-rpm").textContent = rpm == null ? "–" : Math.round(rpm).toLocaleString("es");
  $("#m-rpm").style.width = `${Math.min(100, (rpm ?? 0) / 130)}%`;
  $("#g-thr").innerHTML = `${thr == null ? "–" : Math.round(thr)}<small>%</small>`;
  $("#m-thr").style.width = `${thr ?? 0}%`;
  $("#g-brk").textContent = brk ? "ON" : "OFF";
  $("#m-brk").style.width = `${brk ?? 0}%`;

  const cur = currentLapOf(drv.num, t) || lastDoneLap(drv.num, t);
  $("#g-tyre").innerHTML = cur?.cmp ? `<span style="color:${COMPOUND[cur.cmp] || "#aaa"}">${CMP_LETTER[cur.cmp] || "?"}</span><small>${cur.life ?? "?"} v · ${cur.cmp.toLowerCase()}</small>` : "–";

  const done = (d.laps[drv.num] || []).filter((l) => l.end != null && l.end <= t);
  const last = done.at(-1);
  $("#g-last").textContent = last ? fmtLap(last.t) : "–";
  // colores de sector: morado = mejor de la sesión hasta ahora, verde = mejor personal
  const sessBest = ["s1", "s2", "s3"].map((s) => {
    let m = Infinity;
    for (const L of Object.values(d.laps)) for (const l of L) if (l.end != null && l.end <= t && l[s] != null && l[s] < m) m = l[s];
    return m;
  });
  $("#g-sec").innerHTML = last ? ["s1", "s2", "s3"].map((s, j) => {
    const v = last[s];
    if (v == null) return "<span>–</span>";
    const pb = Math.min(...done.map((l) => l[s] ?? Infinity));
    const cls = v <= sessBest[j] ? "pur" : v <= pb ? "grn" : "yel";
    return `<span class="${cls}">${v.toFixed(1)}</span>`;
  }).join("") : "";
  const valid = done.filter((l) => l.t != null && !l.del);
  const best = valid.length ? Math.min(...valid.map((l) => l.t)) : null;
  $("#g-best").textContent = fmtLap(best);
  const stops = S.pits[drv.num].filter(([p]) => p <= t).length;
  $("#g-stops").textContent = `Vuelta ${cur?.n ?? "–"} · ${stops} parada${stops === 1 ? "" : "s"}`;
}

/* ------------------------------------------------------------ reproducción */
function setPlaying(p) {
  S.playing = p;
  $("#play").textContent = p ? "❚❚" : "▶";
  $("#play").setAttribute("aria-label", p ? "Pausar" : "Reproducir");
}
$("#play").onclick = () => {
  if (!S.d) return;
  if (S.t >= S.tEnd) S.t = S.d.timeline.t0;
  setPlaying(!S.playing);
};
$("#speed").onchange = (e) => (S.speed = +e.target.value);
const scrub = $("#scrub");
scrub.oninput = () => { S.dragging = true; S.t = S.d.timeline.t0 + +scrub.value; updateUi(true); };
scrub.onchange = () => (S.dragging = false);
document.addEventListener("keydown", (e) => {
  if (!S.d || ["INPUT", "SELECT"].includes(document.activeElement?.tagName) && document.activeElement.type !== "range") return;
  if (e.code === "Space") { e.preventDefault(); $("#play").click(); }
  if (e.code === "ArrowRight") { S.t = Math.min(S.tEnd, S.t + 10); updateUi(true); }
  if (e.code === "ArrowLeft") { S.t = Math.max(S.d.timeline.t0, S.t - 10); updateUi(true); }
});
$$("#gap-mode button").forEach((b) => (b.onclick = () => {
  S.gapMode = b.dataset.m;
  $$("#gap-mode button").forEach((x) => x.classList.toggle("on", x === b));
  updateUi(true);
}));
["#opt-speed", "#opt-corners"].forEach((s) => ($(s).onchange = buildLayer));
new ResizeObserver(() => resize()).observe(cv);

let last = performance.now(), lastUi = 0;
function loop(now) {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  if (S.d && !$("#app").hidden) {
    ensureChunks();
    // si el tramo actual no ha llegado, el reloj espera (como un video que se queda cargando)
    if (S.playing && chunkReady(frameAt(S.t)[0])) {
      S.t += dt * S.speed;
      if (S.t >= S.tEnd) { S.t = S.tEnd; setPlaying(false); }
    }
    drawTrack();
    if (now - lastUi > 150) { updateUi(); lastUi = now; }
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* ----------------------------------------------------------------- análisis */
Chart.defaults.color = "#8a93a6";
Chart.defaults.borderColor = "#242a37";
Chart.defaults.font.family = "Titillium Web";
Chart.defaults.plugins.legend.labels.boxWidth = 10;
Chart.defaults.animation = false;

$$("#tabs button").forEach((b) => (b.onclick = () => {
  S.tab = b.dataset.tab;
  $$("#tabs button").forEach((x) => x.classList.toggle("on", x === b));
  renderTab();
}));

function renderChips() {
  const d = S.d, box = $("#chips");
  box.hidden = !["laps", "pos"].includes(S.tab);
  if (box.hidden) return;
  const ranked = [...d.drivers].sort((a, b) => (a.pos ?? 99) - (b.pos ?? 99));
  box.innerHTML = ranked.map((x) =>
    `<button class="chip ${S.chips.has(x.num) ? "on" : ""}" style="--c:${x.color}" data-n="${x.num}"><i></i>${esc(x.abbr)}</button>`).join("");
  $$(".chip", box).forEach((c) => (c.onclick = () => {
    const n = c.dataset.n;
    S.chips.has(n) ? S.chips.delete(n) : S.chips.add(n);
    renderTab();
  }));
}

function chart(id, cfg) {
  S.charts[id]?.destroy();
  S.charts[id] = new Chart($(`#${id}`), cfg);
  return S.charts[id];
}

// equipos con dos pilotos comparten color: el segundo va en línea discontinua
function dashFor(num) {
  const drv = S.d.drivers[S.byNum[num]];
  const mates = S.d.drivers.filter((x) => x.team === drv.team).sort((a, b) => (a.pos ?? 99) - (b.pos ?? 99));
  return mates[0]?.num === num ? [] : [6, 4];
}

function renderTab() {
  for (const k of Object.keys(S.charts)) { S.charts[k].destroy(); delete S.charts[k]; }
  renderChips();
  const body = $("#tab-body"), d = S.d;
  S.msgCount = -1;
  ({ laps: tabLaps, pos: tabPos, strategy: tabStrategy, compare: tabCompare, results: tabResults, weather: tabWeather })[S.tab](body, d);
}

function tabLaps(body, d) {
  body.innerHTML = `<div class="opts-row"><label><input type="checkbox" id="slow" ${S.slowFilter ? "checked" : ""}> Ocultar vueltas lentas (boxes, SC, salida)</label>
    <span>Vuelta rápida: <b>${esc(d.drivers[S.byNum[d.meta.fastest.num]]?.abbr)}</b> ${fmtLap(d.meta.fastest.t)} (V${d.meta.fastest.lap})</span></div>
    <div class="chart-box"><canvas id="c-laps"></canvas></div>`;
  $("#slow").onchange = (e) => { S.slowFilter = e.target.checked; renderTab(); };
  const lim = d.meta.fastest.t * 1.08;
  const ds = [...S.chips].map((n) => {
    const drv = d.drivers[S.byNum[n]];
    const pts = (d.laps[n] || []).filter((l) => l.t != null && (!S.slowFilter || (l.t < lim && l.pin == null && l.pout == null)))
      .map((l) => ({ x: l.n, y: l.t, cmp: l.cmp }));
    return { label: drv.abbr, data: pts, borderColor: drv.color, backgroundColor: drv.color, borderDash: dashFor(n),
      pointRadius: 2.5, pointBackgroundColor: pts.map((p) => COMPOUND[p.cmp] || drv.color), borderWidth: 2, tension: 0.2, spanGaps: false };
  });
  chart("c-laps", {
    type: "line", data: { datasets: ds },
    options: {
      maintainAspectRatio: false, parsing: false, interaction: { mode: "nearest", intersect: false },
      scales: { x: { type: "linear", title: { display: true, text: "Vuelta" }, ticks: { precision: 0 } },
        y: { ticks: { callback: fmtLap }, title: { display: true, text: "Tiempo de vuelta" } } },
      plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmtLap(c.raw.y)} · ${c.raw.cmp || ""}` } } },
    },
  });
}

function tabPos(body, d) {
  if (!d.meta.isRace) { body.innerHTML = `<p class="muted">El gráfico de posiciones está disponible para carreras y sprints.</p>`; return; }
  body.innerHTML = `<div class="chart-box" style="height:460px"><canvas id="c-pos"></canvas></div>`;
  const ds = [...S.chips].map((n) => {
    const drv = d.drivers[S.byNum[n]];
    const pts = [{ x: 0, y: drv.grid || null }, ...(d.laps[n] || []).filter((l) => l.pos != null).map((l) => ({ x: l.n, y: l.pos }))];
    return { label: drv.abbr, data: pts, borderColor: drv.color, backgroundColor: drv.color, borderDash: dashFor(n), pointRadius: 0, borderWidth: 2.5, stepped: false };
  });
  chart("c-pos", {
    type: "line", data: { datasets: ds },
    options: {
      maintainAspectRatio: false, parsing: false, interaction: { mode: "nearest", intersect: false },
      scales: { x: { type: "linear", title: { display: true, text: "Vuelta (0 = parrilla)" }, ticks: { precision: 0 } },
        y: { reverse: true, min: 1, max: d.drivers.length, ticks: { stepSize: 1 }, title: { display: true, text: "Posición" } } },
      plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: P${c.raw.y}` } } },
    },
  });
}

function tabStrategy(body, d) {
  const ranked = [...d.drivers].sort((a, b) => (a.pos ?? 99) - (b.pos ?? 99));
  body.innerHTML = `<div class="opts-row">${Object.entries(COMPOUND).map(([k, c]) =>
    `<span><span class="tyre" style="--c:${c};display:inline-grid;vertical-align:middle">${CMP_LETTER[k]}</span> ${k.toLowerCase()}</span>`).join("")}</div>
    <div class="chart-box" style="height:${Math.max(320, ranked.length * 24 + 60)}px"><canvas id="c-strat"></canvas></div>`;
  const stints = [];
  ranked.forEach((drv, row) => {
    const L = d.laps[drv.num] || [];
    let cur = null;
    for (const l of L) {
      if (!cur || l.stint !== cur.stint) { cur = { row, stint: l.stint, cmp: l.cmp, a: l.n - 1, b: l.n, life0: l.life }; stints.push(cur); } else cur.b = l.n;
    }
  });
  const maxStint = Math.max(1, ...stints.map((s) => s.stint ?? 1));
  const ds = [];
  for (let k = 1; k <= maxStint; k++) {
    const mine = ranked.map((_, row) => stints.find((s) => s.row === row && (s.stint ?? 1) === k));
    ds.push({ label: `Stint ${k}`, data: mine.map((s) => (s ? [s.a, s.b] : null)), cmp: mine.map((s) => s?.cmp),
      backgroundColor: mine.map((s) => COMPOUND[s?.cmp] || "#555"), borderColor: "#0b0d12", borderWidth: 1.5, borderSkipped: false, barPercentage: 0.7, grouped: false });
  }
  chart("c-strat", {
    type: "bar", data: { labels: ranked.map((x) => x.abbr), datasets: ds },
    options: {
      indexAxis: "y", maintainAspectRatio: false,
      scales: { x: { min: 0, title: { display: true, text: "Vuelta" } }, y: { grid: { display: false } } },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.dataset.cmp[c.dataIndex] || "?"}: vueltas ${c.raw[0] + 1}–${c.raw[1]}` } } },
    },
  });
}

function tabCompare(body, d) {
  const opts = (sel) => [...d.drivers].sort((a, b) => (a.pos ?? 99) - (b.pos ?? 99))
    .filter((x) => d.fastestLaps[x.num]).map((x) => `<option value="${x.num}" ${x.num === sel ? "selected" : ""}>${esc(x.abbr)} · ${esc(x.name)}</option>`).join("");
  body.innerHTML = `<div class="cmp-head"><select id="cmp-a">${opts(S.cmpA)}</select> vs <select id="cmp-b">${opts(S.cmpB)}</select>
    <span id="cmp-times" class="lt"></span></div>
    <div class="chart-box"><canvas id="c-spd"></canvas></div>
    <div class="chart-box sm"><canvas id="c-thr"></canvas></div>
    <div class="chart-box sm"><canvas id="c-gear"></canvas></div>`;
  $("#cmp-a").onchange = (e) => { S.cmpA = e.target.value; renderTab(); };
  $("#cmp-b").onchange = (e) => { S.cmpB = e.target.value; renderTab(); };
  // la telemetría de cada vuelta rápida se pide recién al abrir esta pestaña
  const missing = [S.cmpA, S.cmpB].filter((n) => n && !(n in S.fastest));
  if (missing.length) {
    $("#cmp-times").innerHTML = `<span class="muted">Cargando telemetría de las vueltas rápidas…</span>`;
    const session = S.session;
    Promise.all(missing.map((n) => fetch(API.fastest(S.url, n)).then((r) => (r.ok ? r.json() : null)).catch(() => null)
      .then((j) => { if (session === S.session) S.fastest[n] = j; })))
      .then(() => { if (session === S.session && S.tab === "compare") renderTab(); });
    return;
  }
  const A = S.fastest[S.cmpA], B = S.fastest[S.cmpB];
  if (!A || !B) {
    $("#cmp-times").innerHTML = `<span class="muted">No hay telemetría de la vuelta rápida de ${esc(d.drivers[S.byNum[A ? S.cmpB : S.cmpA]]?.abbr)}.</span>`;
    return;
  }
  const da = d.drivers[S.byNum[S.cmpA]], db = d.drivers[S.byNum[S.cmpB]];
  const cb = da.color === db.color ? "#ffffff" : db.color;
  const delta = B.t - A.t;
  $("#cmp-times").innerHTML = `<b style="color:${da.color}">${esc(da.abbr)}</b> ${fmtLap(A.t)} (V${A.lap}, ${esc(A.cmp || "?")}) ·
    <b style="color:${cb}">${esc(db.abbr)}</b> ${fmtLap(B.t)} (V${B.lap}, ${esc(B.cmp || "?")}) · Δ ${delta >= 0 ? "+" : ""}${delta.toFixed(3)} s`;
  const series = (F, key) => F.dist.map((x, k) => ({ x, y: F[key][k] }));
  const base = (ytitle, extra = {}) => ({
    maintainAspectRatio: false, parsing: false, interaction: { mode: "index", intersect: false },
    scales: { x: { type: "linear", min: 0, title: { display: true, text: "Distancia (m)" } }, y: { title: { display: true, text: ytitle }, ...extra } },
    elements: { point: { radius: 0 } },
  });
  chart("c-spd", { type: "line", data: { datasets: [
    { label: `${da.abbr} velocidad`, data: series(A, "spd"), borderColor: da.color, borderWidth: 2 },
    { label: `${db.abbr} velocidad`, data: series(B, "spd"), borderColor: cb, borderWidth: 2 },
  ] }, options: base("km/h") });
  chart("c-thr", { type: "line", data: { datasets: [
    { label: `${da.abbr} acelerador`, data: series(A, "thr"), borderColor: da.color, borderWidth: 1.5 },
    { label: `${db.abbr} acelerador`, data: series(B, "thr"), borderColor: cb, borderWidth: 1.5 },
    { label: `${da.abbr} freno`, data: series(A, "brk"), borderColor: "transparent", backgroundColor: hex2rgba(da.color, 0.25), fill: true, stepped: true },
    { label: `${db.abbr} freno`, data: series(B, "brk"), borderColor: "transparent", backgroundColor: cb === "#ffffff" ? "rgba(255,255,255,.2)" : hex2rgba(cb, 0.25), fill: true, stepped: true },
  ] }, options: base("%", { min: 0, max: 100 }) });
  chart("c-gear", { type: "line", data: { datasets: [
    { label: `${da.abbr} marcha`, data: series(A, "gear"), borderColor: da.color, borderWidth: 1.5, stepped: true },
    { label: `${db.abbr} marcha`, data: series(B, "gear"), borderColor: cb, borderWidth: 1.5, stepped: true },
  ] }, options: base("Marcha", { min: 0, max: 9, ticks: { stepSize: 1 } }) });
}

function tabResults(body, d) {
  const ranked = [...d.drivers].sort((a, b) => (a.pos ?? 99) - (b.pos ?? 99));
  const best = (n) => { const v = (d.laps[n] || []).filter((l) => l.t != null && !l.del).map((l) => l.t); return v.length ? Math.min(...v) : null; };
  const isQ = /Qualifying|Shootout/.test(d.meta.session);
  const rows = ranked.map((x) => {
    const stops = S.pits[x.num].length;
    const delta = x.grid && x.pos ? x.grid - x.pos : null;
    // FastF1: el ganador trae el tiempo total; el resto, la diferencia con el ganador
    const timeTxt = x.time == null ? esc(x.status || "")
      : x.pos === 1 ? `${fmtClock(x.time)}.${String(Math.round((x.time % 1) * 1000)).padStart(3, "0")}` : `+${x.time.toFixed(3)}`;
    return `<tr><td class="n">${x.pos ?? "–"}</td>
      <td><span style="display:inline-block;width:4px;height:14px;background:${x.color};margin-right:8px;vertical-align:-2px"></span><b>${esc(x.abbr)}</b> <span class="muted">${esc(x.name)}</span></td>
      <td>${esc(x.team)}</td>
      ${d.meta.isRace ? `<td class="n">${x.grid || "PL"}</td><td class="n ${delta > 0 ? "delta up" : delta < 0 ? "delta down" : ""}">${delta == null ? "" : delta > 0 ? "▲" + delta : delta < 0 ? "▼" + -delta : "="}</td>
        <td class="n">${timeTxt}</td><td class="n">${stops}</td><td class="n">${x.points ?? 0}</td>` : ""}
      ${isQ ? `<td class="n">${fmtLap(x.q1)}</td><td class="n">${fmtLap(x.q2)}</td><td class="n">${fmtLap(x.q3)}</td>` : ""}
      <td class="n">${fmtLap(best(x.num))}</td></tr>`;
  }).join("");
  body.innerHTML = `<div class="table-wrap"><table class="res"><thead><tr><th class="n">Pos</th><th>Piloto</th><th>Equipo</th>
    ${d.meta.isRace ? `<th class="n">Parrilla</th><th class="n">+/-</th><th class="n">Tiempo / Estado</th><th class="n">Paradas</th><th class="n">Puntos</th>` : ""}
    ${isQ ? `<th class="n">Q1</th><th class="n">Q2</th><th class="n">Q3</th>` : ""}
    <th class="n">Mejor vuelta</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function tabWeather(body, d) {
  body.innerHTML = `<div class="two-col"><div>
      <div class="chart-box"><canvas id="c-weather"></canvas></div></div>
      <div><div class="opts-row"><b style="color:var(--text)">Dirección de carrera</b> <span>(hasta el momento actual)</span></div>
      <div class="msgs" id="msgs"></div></div></div>`;
  const t0 = d.timeline.t0;
  const pts = (k) => d.weather.map((w) => ({ x: (w.t - t0) / 60, y: w[k] }));
  chart("c-weather", { type: "line", data: { datasets: [
    { label: "Pista °C", data: pts("track"), borderColor: "#ff7a45", borderWidth: 2, pointRadius: 0 },
    { label: "Aire °C", data: pts("air"), borderColor: "#3d8bff", borderWidth: 2, pointRadius: 0 },
    { label: "Humedad %", data: pts("hum"), borderColor: "#8a93a6", borderDash: [4, 4], borderWidth: 1.5, pointRadius: 0, yAxisID: "y2" },
    { label: "Lluvia", data: d.weather.map((w) => ({ x: (w.t - t0) / 60, y: w.rain ? 100 : null })), type: "bar", backgroundColor: "rgba(74,168,255,.25)", yAxisID: "y2", barPercentage: 1, categoryPercentage: 1 },
  ] }, options: {
    maintainAspectRatio: false, parsing: false, interaction: { mode: "index", intersect: false },
    scales: { x: { type: "linear", title: { display: true, text: "Minutos desde el inicio" } }, y: { title: { display: true, text: "°C" } },
      y2: { position: "right", min: 0, max: 100, grid: { display: false }, title: { display: true, text: "%" } } },
  } });
  renderMessages();
}

function renderMessages() {
  const box = $("#msgs");
  if (!box) return;
  const list = S.d.messages.filter((m) => m.t <= S.t);
  if (list.length === S.msgCount) return;
  S.msgCount = list.length;
  box.innerHTML = list.length ? list.slice().reverse().map((m) =>
    `<div class="msg ${esc(m.flag || m.cat || "")}"><div class="mt">${fmtClock(m.t - S.d.timeline.t0)}${m.lap ? ` · V${m.lap}` : ""} · ${esc(m.cat || "")}</div>${esc(m.msg)}</div>`).join("")
    : `<p class="muted">Sin mensajes todavía.</p>`;
}

initPicker();
// en GitHub Pages no hay servidor donde iniciar sesión de F1TV
if (STATIC) $("#auth-btn").hidden = true;
else refreshAuth();
