/* TypeScript-style viewer for ambulantes (read-only). */

declare const XLSX: any;
declare const Papa: any;
declare const google: any;

type LatLng = { lat: number | null; lng: number | null };
type RecordRow = Record<string, any>;

type Business = {
  id: string;
  licencia: string;
  periodo: string;
  anio: number | null;
  titular: string;
  ruc: string;
  dir: string;
  num: string;
  mz: string;
  lt: string;
  sector: string;
  giro: string;
  nombre_comercial: string;
  lat: number | null;
  lng: number | null;
};

/* ==================== Config ==================== */
const DATA_CANDIDATES = [
  "comercio_actualizado.xlsx",
  "comercio_actualizado.csv",
  "ambulantes_actualizado.xlsx",
  "ambulantes_actualizado.csv",
  "ambulantes.xlsx",
  "ambulantes.csv"
];

const MAP_ID_LIGHT = "REEMPLAZA_CON_TU_MAP_ID_CLARO";
const MAP_ID_DARK = "REEMPLAZA_CON_TU_MAP_ID_OSCURO";
const PACHACAMAC_CENTER = { lat: -12.155, lng: -76.87 };

const TURNO_STROKES = { manana: "#f59e0b", tarde: "#6366f1" };
const strokeForTurno = (turno: string) => TURNO_STROKES[turno] || TURNO_STROKES.manana;

/* ==================== Estado ==================== */
let map: any;
let infoWindow: any;
let markers: any[] = [];
let allData: Business[] = [];

/* ==================== Utils ==================== */
const normalizeKey = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, "_");

const esc = (t: unknown) =>
  String(t ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const theme = () => document.documentElement.getAttribute("data-theme") || "light";

function toast(msg: string, ok = true) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.style.background = ok ? "#0ea5e9" : "#ef4444";
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2300);
}

function parseUbicacion(val: unknown): LatLng {
  if (!val) return { lat: null, lng: null };
  const txt = String(val).replace(/\s+/g, "");
  const [la, ln] = txt.split(",");
  const lat = parseFloat(la);
  const lng = parseFloat(ln);
  return { lat: Number.isFinite(lat) ? lat : null, lng: Number.isFinite(lng) ? lng : null };
}

function normalizeTurno(v: unknown) {
  const k = String(v || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (k.includes("tarde")) return "tarde";
  if (k.includes("manana") || k.includes("mañana")) return "manana";
  return "";
}

const normGiro = (g: unknown) => String(g || "").trim().toLowerCase();
const OVERRIDE_COLORS: Record<string, string> = { asedipa: "#22c55e" };
const PALETTE_HEX = [
  "#2563eb",
  "#8b5cf6",
  "#ef4444",
  "#f59e0b",
  "#06b6d4",
  "#f472b6",
  "#a855f7",
  "#eab308",
  "#fb7185",
  "#14b8a6",
  "#0ea5e9",
  "#94a3b8",
  "#f97316",
  "#84cc16",
  "#38bdf8",
  "#d946ef",
  "#10b981",
  "#dc2626",
  "#7c3aed",
  "#3b82f6",
  "#f43f5e",
  "#22d3ee",
  "#9333ea",
  "#ca8a04",
  "#0891b2",
  "#4f46e5",
  "#65a30d",
  "#ea580c",
  "#0284c7"
].filter((v, i, arr) => arr.indexOf(v) === i);

let GIRO_COLOR_MAP: Record<string, string> = {};

function buildGiroColorMap(giros: string[]) {
  const used = new Set(Object.values(OVERRIDE_COLORS).map((color) => color.toLowerCase()));
  GIRO_COLOR_MAP = {};

  giros.forEach((giro) => {
    const key = normGiro(giro);
    if (!key) return;
    if (OVERRIDE_COLORS[key]) {
      GIRO_COLOR_MAP[key] = OVERRIDE_COLORS[key];
      return;
    }

    const available = PALETTE_HEX.find((v) => !used.has(v.toLowerCase()));
    const choice = available || "#64748b";
    used.add(choice.toLowerCase());
    GIRO_COLOR_MAP[key] = choice;
  });
}

function colorForGiro(giro: string) {
  return GIRO_COLOR_MAP[normGiro(giro)] || "#64748b";
}

function popupHtml(a: any) {
  return `
    <div style="min-width:260px;max-width:360px;font-family:inherit">
      <div style="background:#1a73e8;color:#fff;padding:10px;border-radius:8px 8px 0 0;margin:-8px -8px 10px -8px;font-weight:700">
        ${esc(a.nombre_comercial || a.licencia || "—")}
      </div>
      <div><b>Año:</b> ${a.anio ?? "-"}</div>
      <div><b>Licencia:</b> ${esc(a.licencia || "-")}</div>
      <div><b>Periodo:</b> ${esc(a.periodo || "-")}</div>
      <div><b>Titular / Razón social:</b> ${esc(a.titular || "-")}</div>
      <div><b>RUC:</b> ${esc(a.ruc || "-")}</div>
      <div><b>Dirección:</b> ${esc(a.dir || "-")} ${a.num ? "N° " + esc(a.num) : ""} ${
    a.mz ? " MZ. " + esc(a.mz) : ""
  } ${a.lt ? " LT. " + esc(a.lt) : ""}</div>
      <div><b>Sector:</b> ${esc(a.sector || "-")}</div>
      <div><b>Giro:</b> ${esc(a.giro || "-")}</div>
    </div>`;
}

function svgIcon(fill: string, stroke: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
    <circle cx="14" cy="14" r="11" fill="${fill}" />
    <circle cx="14" cy="14" r="12.5" fill="none" stroke="${stroke}" stroke-width="3" />
  </svg>`;
  return {
    url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg),
    scaledSize: new google.maps.Size(28, 28),
    anchor: new google.maps.Point(14, 14)
  };
}

function clearMarkers() {
  markers.forEach((m) => m.setMap && m.setMap(null));
  markers = [];
}

function renderMarkers(data: Business[]) {
  clearMarkers();
  const bounds = new google.maps.LatLngBounds();
  const hasAdv = !!(google.maps.marker && google.maps.marker.AdvancedMarkerElement);
  const ring = strokeForTurno("manana");

  data.forEach((a) => {
    if (!Number.isFinite(a.lat) || !Number.isFinite(a.lng)) return;
    const pos = { lat: a.lat!, lng: a.lng! };
    const fill = colorForGiro(a.giro);

    if (hasAdv) {
      const node = document.createElement("div");
      node.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
        <circle cx="14" cy="14" r="11" fill="${fill}" />
        <circle cx="14" cy="14" r="12.5" fill="none" stroke="${ring}" stroke-width="3" />
      </svg>`;
      const mk = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: pos,
        title: a.licencia,
        content: node
      });
      mk.addListener("gmp-click", () => {
        infoWindow.setContent(popupHtml(a));
        infoWindow.open({ anchor: mk, map });
      });
      markers.push(mk);
      bounds.extend(mk.position);
    } else {
      const mk = new google.maps.Marker({
        map,
        position: pos,
        title: a.licencia,
        icon: svgIcon(fill, ring)
      });
      mk.addListener("click", () => {
        infoWindow.setContent(popupHtml(a));
        infoWindow.open({ anchor: mk, map });
      });
      markers.push(mk);
      bounds.extend(mk.getPosition());
    }
  });

  if (data.some((a) => Number.isFinite(a.lat) && Number.isFinite(a.lng))) {
    map.fitBounds(bounds, 60);
  } else {
    map.setCenter(PACHACAMAC_CENTER);
    map.setZoom(13);
  }
}

function parseYear(val: unknown) {
  const m = String(val || "").match(/(19|20)\d{2}/);
  const y = m ? parseInt(m[0], 10) : NaN;
  return Number.isFinite(y) && y >= 1990 && y <= 2100 ? y : null;
}

function buildYearColorMap(years: number[]) {
  const YEAR_COLOR_MAP: Record<string, string> = {};
  years.forEach((y, i) => {
    YEAR_COLOR_MAP[String(y)] = PALETTE_HEX[i % PALETTE_HEX.length];
  });
  return YEAR_COLOR_MAP;
}

function loadFromUrl(name: string) {
  const url = new URL(name, window.location.origin).href;
  return fetch(url).then((resp) => {
    if (!resp.ok) throw new Error(`${name} -> HTTP ${resp.status}`);
    const low = name.toLowerCase();
    if (low.endsWith(".xlsx") || low.endsWith(".xls")) {
      return resp.arrayBuffer().then((buf) => {
        const wb = XLSX.read(buf, { type: "array" });
        const sh = wb.Sheets[wb.SheetNames[0]];
        return XLSX.utils.sheet_to_json(sh, { defval: "" }) as RecordRow[];
      });
    }

    return resp.text().then((text) =>
      new Promise<RecordRow[]>((resolve, reject) => {
        Papa.parse(text, {
          header: true,
          delimiter: text.includes(";") ? ";" : ",",
          skipEmptyLines: true,
          complete: (o: any) => resolve(o.data),
          error: reject
        });
      })
    );
  });
}

async function autoLoad() {
  const errors: string[] = [];

  for (const candidate of DATA_CANDIDATES) {
    try {
      const rows = await loadFromUrl(candidate);
      return { rows, filename: candidate };
    } catch (err: any) {
      errors.push(`${candidate}: ${err?.message ?? err}`);
    }
  }

  throw new Error(`No encontré ${DATA_CANDIDATES.join(" / ")} junto al HTML. Detalles: ${errors.join(" | ")}`);
}

function normRows(rows: RecordRow[]): Business[] {
  const out: Business[] = [];
  const licCounter: Record<string, number> = {};
  let rowIdx = 0;

  for (const row of rows) {
    const n: Record<string, any> = {};
    Object.keys(row).forEach((k) => (n[normalizeKey(k)] = row[k]));

    const licencia = String(
      [n["licencia"]].find(Boolean) || ""
    ).trim();

    const periodo = String(
      [n["periodo"]].find(Boolean) || ""
    ).trim();

    const titular = String(
      [
        n["apellidos_y_nombres_/_razon_social"],
        n["apellidos_y_nombres/_razon_social"],
        n["apellidos_y_nombres_razon_social"],
        n["apellidos_y_nombres"],
        n["razon_social"],
        n["titular"],
        n["nombres_y_apellidos"]
      ].find(Boolean) || ""
    ).trim();

    const ruc = String(
      [n["r_u_c_"], n["ruc"], n["r.u.c."], n["r_u_c"]].find(Boolean) || ""
    ).trim();

    const dir = String(
      [
        n["direccion_del_establecimiento_comercial"],
        n["direccion"]
      ].find(Boolean) || ""
    ).trim();

    const num = String(
      [n["n°"], n["n"], n["numero"]].find(Boolean) || ""
    ).trim();

    const mz = String([n["mz."], n["mz"]].find(Boolean) || "").trim();
    const lt = String([n["lt."], n["lt"]].find(Boolean) || "").trim();
    const sector = String([n["sector"]].find(Boolean) || "").trim();
    const giro = String([
      n["giro_del_establecimiento"],
      n["giro"]
    ].find(Boolean) || "").trim();
    const nombreCom = String([n["nombre_comercial"]].find(Boolean) || "").trim();

    let lat = parseFloat(String([n["lat"]].find(Boolean) || ""));
    let lng = parseFloat(String([n["long"], n["lng"]].find(Boolean) || ""));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      const p = parseUbicacion([n["ubicacion"]].find(Boolean) || "");
      lat = p.lat ?? NaN;
      lng = p.lng ?? NaN;
    }

    const anio = parseYear(periodo);

    let uid: string;
    if (licencia) {
      licCounter[licencia] = (licCounter[licencia] || 0) + 1;
      uid = `${licencia}#${licCounter[licencia]}`;
    } else {
      const fallback = ruc || nombreCom || giro;
      uid = fallback ? `${fallback}|${++rowIdx}` : `${++rowIdx}`;
    }

    out.push({
      id: uid,
      licencia,
      periodo,
      anio,
      titular,
      ruc,
      dir,
      num,
      mz,
      lt,
      sector,
      giro,
      nombre_comercial: nombreCom,
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null
    });
  }

  return out;
}

function renderLegend() {
  const legend = document.getElementById("legendGiros");
  if (!legend) return;
  legend.innerHTML = "";
  Object.keys(GIRO_COLOR_MAP)
    .sort((a, b) => a.localeCompare(b, "es"))
    .forEach((g) => {
      const item = document.createElement("div");
      item.className = "legend-item";
      item.innerHTML = `<span class="legend-ring" style="border-color:${GIRO_COLOR_MAP[g]}"></span> ${esc(
        g
      )}`;
      legend.appendChild(item);
    });
}

function refresh() {
  const sector = (document.getElementById("sectorFilter") as HTMLSelectElement).value;
  const year = (document.getElementById("yearFilter") as HTMLSelectElement).value;
  const q = (document.getElementById("searchInput") as HTMLInputElement).value.trim().toLowerCase();

  const filtered = allData.filter((a) => {
    const sOk = sector === "todos" || String(a.sector).toLowerCase() === String(sector).toLowerCase();
    const yOk = year === "todos" || String(a.anio) === String(year);
    const qOk =
      !q ||
      [a.nombre_comercial, a.titular, a.giro, a.dir, a.sector, a.licencia, a.periodo].some((v) =>
        String(v || "").toLowerCase().includes(q)
      );
    return sOk && yOk && qOk;
  });

  renderMarkers(filtered);
  updateStats(filtered);
}

function updateStats(filtered: Business[]) {
  const sectores = [...new Set(allData.map((a) => a.sector).filter(Boolean))];
  const years = [...new Set(allData.map((a) => a.anio).filter(Boolean))];
  const visible = filtered.filter((a) => Number.isFinite(a.lat) && Number.isFinite(a.lng)).length;

  (document.getElementById("sectorCount") as HTMLElement).textContent = String(sectores.length);
  (document.getElementById("yearCount") as HTMLElement).textContent = String(years.length);
  (document.getElementById("visibleCount") as HTMLElement).textContent = String(visible);
  (document.getElementById("totalCount") as HTMLElement).textContent = String(allData.length);

  buildYearColorMap(years as number[]);
  buildGiroColorMap(sectores);
  renderLegend();
}

function populateFilters() {
  const sectores = [...new Set(allData.map((a) => a.sector).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "es")
  );
  const sel = document.getElementById("sectorFilter") as HTMLSelectElement;
  sel.innerHTML = '<option value="todos">Todos</option>';
  sectores.forEach((s) => {
    const o = document.createElement("option");
    o.value = s;
    o.textContent = s;
    sel.appendChild(o);
  });

  const years = [...new Set(allData.map((a) => a.anio).filter(Boolean))].sort((a, b) => (a as number) - (b as number));
  const ysel = document.getElementById("yearFilter") as HTMLSelectElement;
  ysel.innerHTML = '<option value="todos">Todos</option>';
  years.forEach((y) => {
    const o = document.createElement("option");
    o.value = String(y);
    o.textContent = String(y);
    ysel.appendChild(o);
  });
}

async function initMap() {
  (document.getElementById("themeToggle") as HTMLButtonElement).addEventListener("click", () => {
    const current = theme();
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("prefers-theme-visor", next);
  });

  document.documentElement.setAttribute(
    "data-theme",
    localStorage.getItem("prefers-theme-visor") || "light"
  );

  map = new google.maps.Map(document.getElementById("map"), {
    center: PACHACAMAC_CENTER,
    zoom: 13,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
    mapId: theme() === "dark" ? MAP_ID_DARK : MAP_ID_LIGHT
  });

  infoWindow = new google.maps.InfoWindow();

  document.getElementById("sectorFilter")?.addEventListener("change", refresh);
  document.getElementById("yearFilter")?.addEventListener("change", refresh);
  document.getElementById("searchInput")?.addEventListener("input", refresh);

  try {
    toast("Cargando datos…");
    const { rows, filename } = await autoLoad();
    allData = normRows(rows);
    populateFilters();
    refresh();
    toast(`Dataset: ${filename} (${allData.length} filas)`);
  } catch (err: any) {
    console.error(err);
    toast(err?.message || "No se pudo cargar el dataset", false);
  }
}

(window as any).initMap = initMap;
