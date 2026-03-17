/* TypeScript-style main logic for the ambulantes map.
   This file is loaded at runtime by transpiling from TS -> JS in the browser.
   It is intentionally written in modern ES modules style and uses type hints for clarity.
*/

declare const XLSX: any;
declare const Papa: any;
declare const JSZip: any;
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

/* ===== Config ===== */
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

const TURNO_LABELS = { manana: "Mañana", tarde: "Tarde" };
const TURNO_STROKES = { manana: "#f59e0b", tarde: "#6366f1" };
const OVERRIDE_COLORS = { asedipa: "#22c55e" };

const PALETTE_HEX = [
  "#2563eb", "#8b5cf6", "#ef4444", "#f59e0b", "#06b6d4", "#f472b6", "#a855f7", "#eab308",
  "#fb7185", "#14b8a6", "#0ea5e9", "#94a3b8", "#f97316", "#84cc16", "#d946ef", "#10b981",
  "#dc2626", "#7c3aed", "#3b82f6", "#f43f5e", "#22d3ee", "#9333ea", "#ca8a04", "#0891b2",
  "#4f46e5", "#65a30d", "#ea580c", "#0284c7"
];

/* ===== State ===== */
const state = {
  map: null as any,
  infoWindow: null as any,
  markers: [] as any[],
  allData: [] as any[],
  selectedId: "",
  assignMode: false,
  mapClickListener: null as any,
  giroColorMap: {} as Record<string, string>,
  toastTimer: 0 as number | null
};

const ui: Record<string, HTMLElement | null> = {};

/* ===== Helpers ===== */
const normalizeKey = (value: unknown) =>
  String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, "_");

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const currentTheme = () => document.documentElement.getAttribute("data-theme") || "light";

const toast = (message: string, ok = true) => {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.style.background = ok ? "#0ea5e9" : "#ef4444";
  el.classList.add("show");
  if (state.toastTimer) window.clearTimeout(state.toastTimer);
  state.toastTimer = window.setTimeout(() => el.classList.remove("show"), 2400);
};

const adjustFabOffset = () => {
  const bar = document.getElementById("exportBar");
  const height = bar ? bar.offsetHeight : 72;
  document.documentElement.style.setProperty("--export-h", `${height}px`);
};

const parseUbicacion = (raw: unknown): LatLng => {
  if (!raw) return { lat: null, lng: null };
  const cleaned = String(raw).replace(/\s+/g, "");
  const [latValue, lngValue] = cleaned.split(",");
  const lat = Number.parseFloat(latValue);
  const lng = Number.parseFloat(lngValue);
  return {
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null
  };
};

const normalizeTurno = (value: unknown) => {
  const normalized = String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (normalized.includes("tarde")) return "tarde";
  if (normalized.includes("manana") || normalized.includes("mañana")) return "manana";
  return "";
};

const colorKey = (value: unknown) =>
  String(value || "").toLowerCase().trim();

const buildGiroColorMap = (giros: string[]) => {
  const used = new Set(Object.values(OVERRIDE_COLORS).map((c) => c.toLowerCase()));
  state.giroColorMap = {};

  gyros: for (const giro of giros) {
    const key = colorKey(giro);
    if (!key) continue;

    if (OVERRIDE_COLORS[key]) {
      state.giroColorMap[key] = OVERRIDE_COLORS[key];
      continue;
    }

    // Choose a palette color not yet used
    let chosen = "#64748b";
    for (const candidate of PALETTE_HEX) {
      if (!used.has(candidate.toLowerCase())) {
        chosen = candidate;
        used.add(candidate.toLowerCase());
        break;
      }
    }

    state.giroColorMap[key] = chosen;
  }
};

const colorForGiro = (giro: string) => state.giroColorMap[colorKey(giro)] || "#64748b";
const strokeForTurno = (turno: string) => TURNO_STROKES[turno] || TURNO_STROKES.manana;
const turnoLabel = (turno: string) => TURNO_LABELS[turno] || TURNO_LABELS.manana;

const popupHtml = (record: any) => {
  return `
    <div style="min-width:260px;max-width:360px;font-family:inherit">
      <div style="background:#1a73e8;color:#fff;padding:10px;border-radius:8px 8px 0 0;margin:-8px -8px 10px -8px;font-weight:700">
        ${escapeHtml(record.nombre || "Sin nombre")}
      </div>
      <div><b>Giro:</b> ${escapeHtml(record.giro || "-")}</div>
      <div><b>Productos:</b> ${escapeHtml(record.productos || "-")}</div>
      <div><b>Zona:</b> ${escapeHtml(record.zona || "-")}</div>
      <div><b>Lugar exacto:</b> ${escapeHtml(record.lugar_exacto || "-")}</div>
      <div><b>Turno:</b> ${turnoLabel(record.turno)}</div>
      <div><b>Horario:</b> ${escapeHtml(record.horario || "-")}</div>
      <div><b>Licencia:</b> ${escapeHtml(record.licencia || "-")}</div>
      <div><b>Vigencia:</b> ${escapeHtml(record.vigencia || "-")}</div>
    </div>`;
};

const svgIcon = (fill: string, stroke: string) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
      <circle cx="14" cy="14" r="11" fill="${fill}" />
      <circle cx="14" cy="14" r="12.5" fill="none" stroke="${stroke}" stroke-width="3" />
    </svg>`;
  return {
    url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg),
    scaledSize: new google.maps.Size(28, 28),
    anchor: new google.maps.Point(14, 14)
  };
};

const buildKmlGroupedByYear = (data: Business[]) => {
  const groups = new Map<string | number, Business[]>();
  data.forEach((a) => {
    const y = a.anio ?? "Sin año";
    if (!groups.has(y)) groups.set(y, []);
    groups.get(y)!.push(a);
  });

  const styles = Array.from(groups.keys())
    .map((y) => {
      const col = colorForYear(y === "Sin año" ? null : (y as number));
      return `
        <Style id="y_${y}">
          <IconStyle><color>${hexToKml(col)}</color><scale>1.2</scale></IconStyle>
          <LabelStyle><scale>0.0</scale></LabelStyle>
        </Style>`;
    })
    .join("\n");

  const folders = Array.from(groups.entries())
    .sort(([a], [b]) => {
      if (a === "Sin año") return 1;
      if (b === "Sin año") return -1;
      return Number(a) - Number(b);
    })
    .map(([y, arr]) => {
      const placemarks = arr
        .filter((a) => Number.isFinite(a.lat) && Number.isFinite(a.lng))
        .map(
          (a) => `
          <Placemark>
            <name>${escapeHtml(a.nombre_comercial || a.licencia || "")}</name>
            <styleUrl>#y_${y}</styleUrl>
            <description><![CDATA[
              <b>Año:</b> ${a.anio ?? "-"}<br/>
              <b>Licencia:</b> ${escapeHtml(a.licencia)}<br/>
              <b>Periodo:</b> ${escapeHtml(a.periodo)}<br/>
              <b>Titular:</b> ${escapeHtml(a.titular)}<br/>
              <b>RUC:</b> ${escapeHtml(a.ruc)}<br/>
              <b>Dirección:</b> ${escapeHtml(a.dir)} ${a.num ? "N° " + escapeHtml(a.num) : ""} ${
            a.mz ? " MZ. " + escapeHtml(a.mz) : ""
          } ${a.lt ? " LT. " + escapeHtml(a.lt) : ""}<br/>
              <b>Sector:</b> ${escapeHtml(a.sector)}<br/>
              <b>Giro:</b> ${escapeHtml(a.giro)}
            ]]></description>
            <Point><coordinates>${a.lng},${a.lat},0</coordinates></Point>
          </Placemark>`
        )
        .join("\n");
      return `<Folder><name>${y}</name>${placemarks}</Folder>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Ambulantes - Pachacamac</name>
    ${styles}
    ${folders}
  </Document>
</kml>`;
};

const toHex = (n: number) => n.toString(16).padStart(2, "0");
const hexToKml = (hex: string) => {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `ff${toHex(b)}${toHex(g)}${toHex(r)}`;
};

const styleYearId = (y: string | number) => `y_${y}`;

/* ===== Year color map ===== */
let YEAR_COLOR_MAP: Record<string, string> = {};
const colorForYear = (y: number | null) => YEAR_COLOR_MAP[String(y)] || "#94a3b8";
const buildYearColorMap = (years: number[]) => {
  YEAR_COLOR_MAP = {};
  years.forEach((y, i) => {
    YEAR_COLOR_MAP[String(y)] = PALETTE_HEX[i % PALETTE_HEX.length];
  });
};

/* ===== Data loading ===== */
const loadFromUrl = async (name: string) => {
  const url = new URL(name, window.location.origin).href;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`No se pudo cargar ${name} (HTTP ${resp.status})`);
  const low = name.toLowerCase();

  if (low.endsWith(".xlsx") || low.endsWith(".xls")) {
    const wb = XLSX.read(await resp.arrayBuffer(), { type: "array" });
    const sh = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sh, { defval: "" }) as RecordRow[];
  }

  const text = await resp.text();
  return new Promise<RecordRow[]>((resolve, reject) => {
    Papa.parse(text, {
      header: true,
      delimiter: text.includes(";") ? ";" : ",",
      skipEmptyLines: true,
      complete: (o: any) => resolve(o.data),
      error: reject
    });
  });
};

const autoLoad = async () => {
  const errors: string[] = [];
  for (const n of DATA_CANDIDATES) {
    try {
      const rows = await loadFromUrl(n);
      return { rows, filename: n };
    } catch (err: any) {
      errors.push(`${n}: ${err?.message ?? err}`);
    }
  }
  throw new Error(`No se encontró ningún dataset compatible. Intentado: ${errors.join(" | ")}`);
};

const normRows = (rows: RecordRow[]): Business[] => {
  const out: Business[] = [];
  const licCounter: Record<string, number> = {};
  let rowIdx = 0;

  for (const row of rows) {
    const n: Record<string, any> = {};
    for (const k of Object.keys(row)) n[normalizeKey(k)] = row[k];

    const licencia = String(
      [
        n["licencia"],
        n["licencia"],
        n["licencia"],
        n["licencia"]
      ].find(Boolean) || ""
    ).trim();

    const periodo = String(
      [n["periodo"], n["periodo"], n["periodo"]].find(Boolean) || ""
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
    const giro = String([n["giro_del_establecimiento"], n["giro"]].find(Boolean) || "").trim();
    const nombreCom = String([n["nombre_comercial"]].find(Boolean) || "").trim();

    let lat = parseFloat(String([n["lat"]].find(Boolean) || ""));
    let lng = parseFloat(String([n["long"], n["lng"]].find(Boolean) || ""));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      const p = parseUbicacion(
        [n["ubicacion"]].find(Boolean) || ""
      );
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
};

const parseYear = (val: unknown) => {
  const m = String(val || "").match(/(19|20)\d{2}/);
  const y = m ? parseInt(m[0], 10) : NaN;
  return Number.isFinite(y) && y >= 1990 && y <= 2100 ? y : null;
};

/** Map helpers */
const renderMarkers = (data: Business[]) => {
  clearMarkers();
  const bounds = new google.maps.LatLngBounds();
  const hasAdv = !!(google.maps.marker && google.maps.marker.AdvancedMarkerElement);
  const ring = strokeForTurno(currentTurno());

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
        map: state.map,
        position: pos,
        title: recordDisplayName(a) || a.licencia,
        content: node
      });
      mk.addListener("gmp-click", () => {
        state.infoWindow.setContent(popupHtml(a));
        state.infoWindow.open({ anchor: mk, map: state.map });
      });
      state.markers.push(mk);
      bounds.extend(mk.position);
    } else {
      const mk = new google.maps.Marker({
        map: state.map,
        position: pos,
        title: recordDisplayName(a) || a.licencia,
        icon: svgIcon(fill, ring)
      });
      mk.addListener("click", () => {
        state.infoWindow.setContent(popupHtml(a));
        state.infoWindow.open({ anchor: mk, map: state.map });
      });
      state.markers.push(mk);
      bounds.extend(mk.getPosition());
    }
  });

  if (data.some((a) => Number.isFinite(a.lat) && Number.isFinite(a.lng))) {
    state.map.fitBounds(bounds, 60);
  } else {
    state.map.setCenter(PACHACAMAC_CENTER);
    state.map.setZoom(13);
  }
};

const clearMarkers = () => {
  state.markers.forEach((m) => m.setMap && m.setMap(null));
  state.markers = [];
};

const recordDisplayName = (a: any) => (a.nombre_comercial || a.titular || "").trim();

const currentTurno = () => (document.getElementById("turnoFilter") as HTMLSelectElement).value;

const currentGiro = () => (document.getElementById("giroFilter") as HTMLSelectElement).value;

const applyFilters = () => {
  const turno = currentTurno();
  const giro = currentGiro();
  const q = (document.getElementById("searchInput") as HTMLInputElement).value.trim().toLowerCase();

  return state.allData.filter((a) => {
    const turnoOk = turno === "todos" || normalizeTurno(a.turno) === turno;
    const giroOk = giro === "todos" || String(a.giro).toLowerCase() === giro;
    const qOk =
      !q ||
      [a.nombre_comercial, a.titular, a.giro, a.zona, a.productos, a.lugar_exacto, a.licencia]
        .some((v) => String(v || "").toLowerCase().includes(q));
    return turnoOk && giroOk && qOk;
  });
};

const updateStats = (filtered: Business[]) => {
  const giros = [...new Set(state.allData.map((a) => a.giro).filter(Boolean))];
  const turnoSet = new Set(state.allData.map((a) => normalizeTurno(a.turno)).filter(Boolean));

  (document.getElementById("totalCount") as HTMLElement).textContent = String(state.allData.length);
  (document.getElementById("visibleCount") as HTMLElement).textContent = String(
    filtered.filter((a) => Number.isFinite(a.lat) && Number.isFinite(a.lng)).length
  );
  (document.getElementById("activeZones") as HTMLElement).textContent = String(turnoSet.size);
  (document.getElementById("missingCount") as HTMLElement).textContent = String(
    state.allData.filter((a) => !Number.isFinite(a.lat) || !Number.isFinite(a.lng)).length
  );

  buildGiroColorMap(giros);
  renderGiroLegend(giros);
};

const renderGiroLegend = (giros: string[]) => {
  const container = document.getElementById("legendGiros");
  if (!container) return;
  container.innerHTML = "";
  giros
    .sort((a, b) => a.localeCompare(b, "es"))
    .forEach((giro) => {
      const el = document.createElement("div");
      el.className = "legend-item";
      el.innerHTML = `<span class="legend-ring" style="border-color: ${colorForGiro(giro)}"></span> ${escapeHtml(
        giro
      )}`;
      container.appendChild(el);
    });
};

const populateFilters = () => {
  const giros = [...new Set(state.allData.map((a) => a.giro).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "es")
  );
  const giroEl = document.getElementById("giroFilter") as HTMLSelectElement;
  giroEl.innerHTML = `<option value="todos">Todos</option>`;
  giros.forEach((g) => {
    const o = document.createElement("option");
    o.value = g;
    o.textContent = g;
    giroEl.appendChild(o);
  });
};

const refresh = () => {
  const filtered = applyFilters();
  renderMarkers(filtered);
  updateStats(filtered);
};

const initMap = async () => {
  setTheme(localStorage.getItem("prefers-theme") || "light");

  const g = (window as any).google;
  if (!(g && g.maps)) {
    alert("No cargó Google Maps. Revisa API key / referrers.");
    return;
  }

  state.map = new google.maps.Map(document.getElementById("map"), {
    center: PACHACAMAC_CENTER,
    zoom: 13,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
    mapId: mapIdForTheme(currentTheme())
  });
  state.infoWindow = new google.maps.InfoWindow();

  document.getElementById("themeToggle")?.addEventListener("click", () => {
    setTheme(currentTheme() === "dark" ? "light" : "dark");
  });

  document.getElementById("giroFilter")?.addEventListener("change", refresh);
  document.getElementById("turnoFilter")?.addEventListener("change", refresh);
  document.getElementById("searchInput")?.addEventListener("input", refresh);

  document.getElementById("btnReset")?.addEventListener("click", () => {
    (document.getElementById("giroFilter") as HTMLSelectElement).value = "todos";
    (document.getElementById("turnoFilter") as HTMLSelectElement).value = "todos";
    (document.getElementById("searchInput") as HTMLInputElement).value = "";
    refresh();
  });

  document.getElementById("btnLoc")?.addEventListener("click", () => {
    if (!navigator.geolocation) {
      toast("Geolocalización no disponible en este navegador.", false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        state.map.setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        state.map.setZoom(17);
      },
      () => {
        toast("No se pudo obtener la ubicación.", false);
      }
    );
  });

  document.getElementById("btnKml")?.addEventListener("click", () => {
    const only = (document.getElementById("onlyVisible") as HTMLInputElement).checked;
    const data = (only ? applyFilters() : state.allData).filter((a) => Number.isFinite(a.lat) && Number.isFinite(a.lng));
    if (!data.length) return toast("No hay datos para exportar", false);
    const kml = buildKmlGroupedByYear(data);
    downloadBlob("ambulantes_pachacamac.kml", new Blob([kml], { type: "application/vnd.google-earth.kml+xml" }));
  });

  document.getElementById("btnKmz")?.addEventListener("click", async () => {
    const only = (document.getElementById("onlyVisible") as HTMLInputElement).checked;
    const data = (only ? applyFilters() : state.allData).filter((a) => Number.isFinite(a.lat) && Number.isFinite(a.lng));
    if (!data.length) return toast("No hay datos para exportar", false);
    const zip = new JSZip();
    zip.file("doc.kml", buildKmlGroupedByYear(data));
    const blob = await zip.generateAsync({ type: "blob" });
    downloadBlob("ambulantes_pachacamac.kmz", blob);
  });

  adjustFabOffset();
  new ResizeObserver(adjustFabOffset).observe(document.getElementById("exportBar") as Element);
  window.addEventListener("resize", adjustFabOffset);

  try {
    toast("Cargando datos…");
    const { rows, filename } = await autoLoad();
    state.allData = normRows(rows);
    populateFilters();
    refresh();
    toast(`Dataset: ${filename} (${state.allData.length} filas)`);
  } catch (err: any) {
    console.error(err);
    toast(err?.message || "No se pudo cargar el dataset", false);
  }
};

function downloadBlob(name: string, blob: Blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

const mapIdForTheme = (th: string) => (th === "dark" ? MAP_ID_DARK || null : MAP_ID_LIGHT || null);

function setTheme(th: string) {
  document.documentElement.setAttribute("data-theme", th);
  localStorage.setItem("prefers-theme", th);
  const icon = document.getElementById("themeIcon");
  if (icon) icon.textContent = th === "dark" ? "☀️" : "🌙";
  if (state.map) {
    const mid = mapIdForTheme(th);
    if (mid) state.map.setOptions({ mapId: mid });
    refresh();
  }
}

// Expose the init callback for Google Maps
(window as any).initMap = initMap;
