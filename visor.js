const VISOR_DATA_CANDIDATES = [
  "ambulantes_actualizado.xlsx",
  "ambulantes_actualizado.csv",
  "ambulantes.xlsx",
  "ambulantes.csv"
];

const VISOR_CENTER = { lat: -12.155, lng: -76.87 };
const VISOR_TURNO_LABELS = { manana: "Manana", tarde: "Tarde" };
const VISOR_TURNO_STROKES = { manana: "#f59e0b", tarde: "#6366f1" };
const VISOR_OVERRIDE_COLORS = { asedipa: "#22c55e" };
const VISOR_PALETTE = [
  "#2563eb", "#8b5cf6", "#ef4444", "#f59e0b", "#06b6d4", "#f472b6", "#a855f7", "#eab308",
  "#fb7185", "#14b8a6", "#0ea5e9", "#94a3b8", "#f97316", "#84cc16", "#d946ef", "#10b981",
  "#dc2626", "#7c3aed", "#3b82f6", "#f43f5e", "#22d3ee", "#9333ea", "#ca8a04", "#0891b2",
  "#4f46e5", "#65a30d", "#ea580c", "#0284c7"
];

const VISOR_TILE_LAYERS = {
  light: {
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    options: { attribution: '&copy; OpenStreetMap contributors &copy; CARTO' }
  },
  dark: {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    options: { attribution: '&copy; OpenStreetMap contributors &copy; CARTO' }
  }
};

const visorState = {
  map: null,
  tileLayer: null,
  markersLayer: null,
  allData: [],
  giroColorMap: {},
  toastTimer: null
};

const visorUi = {};

function cacheVisorDom() {
  visorUi.giroFilter = document.getElementById("giroFilter");
  visorUi.turnoFilter = document.getElementById("turnoFilter");
  visorUi.searchInput = document.getElementById("searchInput");
  visorUi.totalCount = document.getElementById("totalCount");
  visorUi.visibleCount = document.getElementById("visibleCount");
  visorUi.activeZones = document.getElementById("activeZones");
  visorUi.legendGiros = document.getElementById("legendGiros");
  visorUi.btnReset = document.getElementById("btnReset");
  visorUi.btnLoc = document.getElementById("btnLoc");
  visorUi.themeToggle = document.getElementById("themeToggle");
  visorUi.themeIcon = document.getElementById("themeIcon");
  visorUi.toast = document.getElementById("toast");
}

const visorNormalizeKey = (value) => String(value || "")
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .trim()
  .replace(/\s+/g, "_");

const visorNormalizeText = (value) => String(value || "")
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .trim();

const visorEscapeHtml = (value) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

const visorTheme = () => document.documentElement.getAttribute("data-theme") || "light";
const visorColorKey = (value) => visorNormalizeText(value);

function visorToast(message, ok = true) {
  visorUi.toast.textContent = message;
  visorUi.toast.style.background = ok ? "#0ea5e9" : "#ef4444";
  visorUi.toast.classList.add("show");
  window.clearTimeout(visorState.toastTimer);
  visorState.toastTimer = window.setTimeout(() => visorUi.toast.classList.remove("show"), 2400);
}

function visorParseUbicacion(rawValue) {
  if (!rawValue) return { lat: null, lng: null };
  const cleaned = String(rawValue).replace(/\s+/g, "");
  const [latValue, lngValue] = cleaned.split(",");
  const lat = Number.parseFloat(latValue);
  const lng = Number.parseFloat(lngValue);
  return {
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null
  };
}

function visorNormalizeTurno(value) {
  const normalized = visorNormalizeText(value);
  if (normalized.includes("tarde")) return "tarde";
  if (normalized.includes("manana")) return "manana";
  return "";
}

function visorInferTurno(horario) {
  const upper = String(horario || "").toUpperCase();
  if (upper.includes("PM") || upper.includes("TARDE") || upper.includes("15:") || upper.includes("16:")) {
    return "tarde";
  }
  return "manana";
}

function visorBuildGiroColorMap(giros) {
  const used = new Set(Object.values(VISOR_OVERRIDE_COLORS).map((color) => color.toLowerCase()));
  visorState.giroColorMap = {};

  giros.forEach((giro) => {
    const key = visorColorKey(giro);
    if (VISOR_OVERRIDE_COLORS[key]) visorState.giroColorMap[key] = VISOR_OVERRIDE_COLORS[key];
  });

  let paletteIndex = 0;
  giros.forEach((giro) => {
    const key = visorColorKey(giro);
    if (!key || visorState.giroColorMap[key]) return;

    let selected = "#64748b";
    while (paletteIndex < VISOR_PALETTE.length) {
      const candidate = VISOR_PALETTE[paletteIndex++];
      if (!used.has(candidate.toLowerCase())) {
        selected = candidate;
        break;
      }
    }

    used.add(selected.toLowerCase());
    visorState.giroColorMap[key] = selected;
  });
}

function visorColorForGiro(giro) {
  return visorState.giroColorMap[visorColorKey(giro)] || "#64748b";
}

function visorStrokeForTurno(turno) {
  return VISOR_TURNO_STROKES[turno] || VISOR_TURNO_STROKES.manana;
}

function visorTurnoLabel(turno) {
  return VISOR_TURNO_LABELS[turno] || VISOR_TURNO_LABELS.manana;
}

function visorPopupHtml(record) {
  return `
    <div class="leaflet-popup-card">
      <div class="leaflet-popup-title">${visorEscapeHtml(record.nombre || "Sin nombre")}</div>
      <div><b>Giro:</b> ${visorEscapeHtml(record.giro || "-")}</div>
      <div><b>Productos:</b> ${visorEscapeHtml(record.productos || "-")}</div>
      <div><b>Zona:</b> ${visorEscapeHtml(record.zona || "-")}</div>
      <div><b>Lugar exacto:</b> ${visorEscapeHtml(record.lugar_exacto || "-")}</div>
      <div><b>Turno:</b> ${visorTurnoLabel(record.turno)}</div>
      <div><b>Horario:</b> ${visorEscapeHtml(record.horario || "-")}</div>
      <div><b>Licencia:</b> ${visorEscapeHtml(record.licencia || "-")}</div>
      <div><b>Vigencia:</b> ${visorEscapeHtml(record.vigencia || "-")}</div>
    </div>`;
}

function visorCreateMarkerIcon(record) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="12" fill="${visorColorForGiro(record.giro)}" />
      <circle cx="16" cy="16" r="14" fill="none" stroke="${visorStrokeForTurno(record.turno)}" stroke-width="3.5" />
    </svg>`;

  return L.divIcon({
    className: "leaflet-svg-marker",
    html: svg,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16]
  });
}

function visorClearMarkers() {
  visorState.markersLayer.clearLayers();
}

function visorRenderMarkers(data) {
  visorClearMarkers();
  const validRecords = data.filter((record) => Number.isFinite(record.lat) && Number.isFinite(record.lng));

  if (!validRecords.length) {
    visorState.map.setView([VISOR_CENTER.lat, VISOR_CENTER.lng], 13);
    return;
  }

  const bounds = [];
  validRecords.forEach((record) => {
    const marker = L.marker([record.lat, record.lng], {
      icon: visorCreateMarkerIcon(record),
      title: record.nombre
    }).bindPopup(visorPopupHtml(record));

    marker.addTo(visorState.markersLayer);
    bounds.push([record.lat, record.lng]);
  });

  visorState.map.fitBounds(bounds, { padding: [40, 40] });
}

function visorGetSearchableValues(record) {
  return [
    record.nombre,
    record.productos,
    record.zona,
    record.giro,
    record.lugar_exacto,
    record.horario,
    record.licencia,
    record.vigencia
  ];
}

function visorApplyFilters() {
  const selectedGiro = visorUi.giroFilter.value;
  const selectedTurno = visorUi.turnoFilter.value;
  const query = visorNormalizeText(visorUi.searchInput.value);

  return visorState.allData.filter((record) => {
    const hasCoords = Number.isFinite(record.lat) && Number.isFinite(record.lng);
    if (!hasCoords) return false;

    const giroMatches = selectedGiro === "todos" || visorColorKey(record.giro) === visorColorKey(selectedGiro);
    const turnoMatches = selectedTurno === "todos" || record.turno === selectedTurno;
    const queryMatches = !query || visorGetSearchableValues(record).some((value) => visorNormalizeText(value).includes(query));

    return giroMatches && turnoMatches && queryMatches;
  });
}

function visorUpdateStats(filtered) {
  const activeZones = new Set(filtered.map((record) => record.zona).filter(Boolean));
  visorUi.totalCount.textContent = String(visorState.allData.length);
  visorUi.visibleCount.textContent = String(filtered.length);
  visorUi.activeZones.textContent = String(activeZones.size);
}

function visorPopulateFilterAndLegend() {
  const giros = [...new Set(visorState.allData.map((record) => record.giro).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "es"));

  visorBuildGiroColorMap(giros);

  visorUi.giroFilter.innerHTML = '<option value="todos">Todos</option>';
  giros.forEach((giro) => {
    const option = document.createElement("option");
    option.value = giro;
    option.textContent = giro;
    visorUi.giroFilter.appendChild(option);
  });

  visorUi.legendGiros.innerHTML = "";
  giros.forEach((giro) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "legend-item";
    item.innerHTML = `<span class="legend-dot" style="background:${visorColorForGiro(giro)}"></span>${visorEscapeHtml(giro)}`;
    item.addEventListener("click", () => {
      visorUi.giroFilter.value = giro;
      visorRefresh();
    });
    visorUi.legendGiros.appendChild(item);
  });
}

function visorRefresh() {
  const filtered = visorApplyFilters();
  visorRenderMarkers(filtered);
  visorUpdateStats(filtered);
}

async function visorLoadFromUrl(fileName) {
  const response = await fetch(fileName);
  if (!response.ok) throw new Error(`No se pudo cargar ${fileName}`);

  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls")) {
    const workbook = XLSX.read(await response.arrayBuffer(), { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { defval: "" });
  }

  const text = await response.text();
  return new Promise((resolve, reject) => {
    Papa.parse(text, {
      header: true,
      delimiter: text.includes(";") ? ";" : ",",
      skipEmptyLines: true,
      complete: (result) => resolve(result.data),
      error: reject
    });
  });
}

async function visorAutoLoad() {
  for (const fileName of VISOR_DATA_CANDIDATES) {
    try {
      const rows = await visorLoadFromUrl(fileName);
      return { rows, filename: fileName };
    } catch (error) {
      // prueba siguiente archivo
    }
  }

  throw new Error(`No se encontro ningun dataset compatible: ${VISOR_DATA_CANDIDATES.join(", ")}`);
}

function visorNormalizeRows(rows) {
  return rows.map((row, index) => {
    const normalized = {};
    Object.keys(row).forEach((key) => {
      normalized[visorNormalizeKey(key)] = row[key];
    });

    let lat = Number.parseFloat(normalized.lat);
    let lng = Number.parseFloat(normalized.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      const fromUbicacion = visorParseUbicacion(normalized.ubicacion || normalized.ubicacion_ || normalized["ubicacion"]);
      lat = fromUbicacion.lat;
      lng = fromUbicacion.lng;
    }

    const turno = visorNormalizeTurno(normalized.turno) || visorInferTurno(normalized.horario);

    return {
      id: String(normalized.id || index + 1),
      nombre: String(normalized.nombre || "").trim(),
      giro: String(normalized.giro || "").trim(),
      productos: String(normalized.productos || "").trim(),
      zona: String(normalized.zona || "").trim(),
      lugar_exacto: String(normalized.lugar_exacto || normalized.lugar || "").trim(),
      horario: String(normalized.horario || "").trim(),
      licencia: String(normalized.licencia || "").trim(),
      vigencia: String(normalized.vigencia || "").trim(),
      turno,
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null
    };
  });
}

function visorApplyThemeUi(themeName) {
  visorUi.themeIcon.textContent = themeName === "dark" ? "☀️" : "🌙";
}

function visorSetLeafletTheme(themeName) {
  const config = VISOR_TILE_LAYERS[themeName] || VISOR_TILE_LAYERS.light;
  if (visorState.tileLayer) {
    visorState.map.removeLayer(visorState.tileLayer);
  }

  visorState.tileLayer = L.tileLayer(config.url, {
    ...config.options,
    maxZoom: 20
  }).addTo(visorState.map);
}

function visorSetTheme(themeName) {
  document.documentElement.setAttribute("data-theme", themeName);
  window.localStorage.setItem("prefers-theme-visor-ambulantes", themeName);
  visorApplyThemeUi(themeName);

  if (visorState.map) {
    visorSetLeafletTheme(themeName);
  }
}

function visorAttachUiEvents() {
  visorUi.giroFilter.addEventListener("change", visorRefresh);
  visorUi.turnoFilter.addEventListener("change", visorRefresh);
  visorUi.searchInput.addEventListener("input", visorRefresh);

  visorUi.btnReset.addEventListener("click", () => {
    visorUi.giroFilter.value = "todos";
    visorUi.turnoFilter.value = "todos";
    visorUi.searchInput.value = "";
    visorRefresh();
  });

  visorUi.btnLoc.addEventListener("click", () => {
    if (!navigator.geolocation) {
      visorToast("Geolocalizacion no disponible.", false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        visorState.map.flyTo([position.coords.latitude, position.coords.longitude], 16, { duration: 0.8 });
      },
      () => visorToast("No se pudo obtener tu ubicacion.", false),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  });

  visorUi.themeToggle.addEventListener("click", () => {
    const next = visorTheme() === "dark" ? "light" : "dark";
    visorSetTheme(next);
  });
}

function visorCreateMap() {
  visorState.map = L.map("map", {
    zoomControl: true,
    preferCanvas: true
  }).setView([VISOR_CENTER.lat, VISOR_CENTER.lng], 13);

  visorState.markersLayer = L.layerGroup().addTo(visorState.map);
  visorSetLeafletTheme(visorTheme());
}

async function visorLoadData() {
  visorToast("Cargando datos...");
  const { rows, filename } = await visorAutoLoad();
  visorState.allData = visorNormalizeRows(rows).filter((record) => Number.isFinite(record.lat) && Number.isFinite(record.lng));
  visorPopulateFilterAndLegend();
  visorRefresh();
  visorToast(`Cargado: ${filename} (${visorState.allData.length} puntos)`);
}

window.initMap = async function initMap() {
  cacheVisorDom();
  const savedTheme = window.localStorage.getItem("prefers-theme-visor-ambulantes") || "light";
  visorSetTheme(savedTheme);
  visorCreateMap();
  visorAttachUiEvents();

  try {
    await visorLoadData();
  } catch (error) {
    visorToast(error.message || "No se pudo cargar el visor.", false);
  }
};
