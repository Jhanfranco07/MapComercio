const DATA_CANDIDATES = [
  "ambulantes_actualizado.xlsx",
  "ambulantes_actualizado.csv",
  "ambulantes.xlsx",
  "ambulantes.csv"
];

const PACHACAMAC_CENTER = { lat: -12.155, lng: -76.87 };
const TURNO_LABELS = { manana: "Manana", tarde: "Tarde" };
const TURNO_STROKES = { manana: "#f59e0b", tarde: "#6366f1" };
const OVERRIDE_COLORS = { asedipa: "#22c55e" };
const PALETTE_HEX = [
  "#2563eb", "#8b5cf6", "#ef4444", "#f59e0b", "#06b6d4", "#f472b6", "#a855f7", "#eab308",
  "#fb7185", "#14b8a6", "#0ea5e9", "#94a3b8", "#f97316", "#84cc16", "#d946ef", "#10b981",
  "#dc2626", "#7c3aed", "#3b82f6", "#f43f5e", "#22d3ee", "#9333ea", "#ca8a04", "#0891b2",
  "#4f46e5", "#65a30d", "#ea580c", "#0284c7"
];

const TILE_LAYERS = {
  light: {
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    options: {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
    }
  },
  dark: {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    options: {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
    }
  }
};

const state = {
  map: null,
  tileLayer: null,
  markersLayer: null,
  allData: [],
  selectedId: "",
  assignMode: false,
  mapClickListener: null,
  giroColorMap: {},
  toastTimer: null
};

const ui = {};

function cacheDom() {
  ui.giroFilter = document.getElementById("giroFilter");
  ui.turnoFilter = document.getElementById("turnoFilter");
  ui.searchInput = document.getElementById("searchInput");
  ui.totalCount = document.getElementById("totalCount");
  ui.visibleCount = document.getElementById("visibleCount");
  ui.activeZones = document.getElementById("activeZones");
  ui.missingCount = document.getElementById("missingCount");
  ui.legendGiros = document.getElementById("legendGiros");
  ui.onlyVisible = document.getElementById("onlyVisible");
  ui.btnKml = document.getElementById("btnKml");
  ui.btnKmz = document.getElementById("btnKmz");
  ui.btnXlsx = document.getElementById("btnXlsx");
  ui.btnCsv = document.getElementById("btnCsv");
  ui.btnAssign = document.getElementById("btnAssign");
  ui.btnCenter = document.getElementById("btnCenter");
  ui.btnClear = document.getElementById("btnClear");
  ui.btnReset = document.getElementById("btnReset");
  ui.btnLoc = document.getElementById("btnLoc");
  ui.personSelect = document.getElementById("personSelect");
  ui.coordPreview = document.getElementById("coordPreview");
  ui.exportBar = document.getElementById("exportBar");
  ui.themeToggle = document.getElementById("themeToggle");
  ui.themeIcon = document.getElementById("themeIcon");
  ui.toast = document.getElementById("toast");
}

const normalizeKey = (value) => String(value || "")
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .trim()
  .replace(/\s+/g, "_");

const normalizeText = (value) => String(value || "")
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .trim();

const escapeHtml = (value) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

const currentTheme = () => document.documentElement.getAttribute("data-theme") || "light";
const colorKey = (value) => normalizeText(value);

function toast(message, ok = true) {
  ui.toast.textContent = message;
  ui.toast.style.background = ok ? "#0ea5e9" : "#ef4444";
  ui.toast.classList.add("show");
  window.clearTimeout(state.toastTimer);
  state.toastTimer = window.setTimeout(() => ui.toast.classList.remove("show"), 2400);
}

function adjustFabOffset() {
  const height = ui.exportBar ? ui.exportBar.offsetHeight : 72;
  document.documentElement.style.setProperty("--export-h", `${height}px`);
}

function parseUbicacion(rawValue) {
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

function normalizeTurno(value) {
  const normalized = normalizeText(value);
  if (normalized.includes("tarde")) return "tarde";
  if (normalized.includes("manana")) return "manana";
  return "";
}

function inferTurno(horario) {
  const upper = String(horario || "").toUpperCase();
  if (upper.includes("PM") || upper.includes("TARDE") || upper.includes("15:") || upper.includes("16:")) {
    return "tarde";
  }
  return "manana";
}

function hslToRgb(h, s, l) {
  const sat = s / 100;
  const lig = l / 100;
  const k = (n) => (n + h / 30) % 12;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n) => lig - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))];
}

function rgbToHex(r, g, b) {
  const toHex = (value) => value.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hslToHex(h, s, l) {
  const [r, g, b] = hslToRgb(h, s, l);
  return rgbToHex(r, g, b);
}

function buildGiroColorMap(giros) {
  const used = new Set(Object.values(OVERRIDE_COLORS).map((color) => color.toLowerCase()));
  state.giroColorMap = {};

  giros.forEach((giro) => {
    const key = colorKey(giro);
    if (OVERRIDE_COLORS[key]) state.giroColorMap[key] = OVERRIDE_COLORS[key];
  });

  let paletteIndex = 0;
  let generatedIndex = 0;

  giros.forEach((giro) => {
    const key = colorKey(giro);
    if (!key || state.giroColorMap[key]) return;

    let selected = "#64748b";
    while (true) {
      selected = paletteIndex < PALETTE_HEX.length
        ? PALETTE_HEX[paletteIndex++]
        : hslToHex((generatedIndex++ * 137.508) % 360, 70, 50);

      if (!used.has(selected.toLowerCase())) break;
    }

    used.add(selected.toLowerCase());
    state.giroColorMap[key] = selected;
  });
}

function colorForGiro(giro) {
  return state.giroColorMap[colorKey(giro)] || "#64748b";
}

function strokeForTurno(turno) {
  return TURNO_STROKES[turno] || TURNO_STROKES.manana;
}

function turnoLabel(turno) {
  return TURNO_LABELS[turno] || TURNO_LABELS.manana;
}

function popupHtml(record) {
  return `
    <div class="leaflet-popup-card">
      <div class="leaflet-popup-title">${escapeHtml(record.nombre || "Sin nombre")}</div>
      <div><b>Giro:</b> ${escapeHtml(record.giro || "-")}</div>
      <div><b>Productos:</b> ${escapeHtml(record.productos || "-")}</div>
      <div><b>Zona:</b> ${escapeHtml(record.zona || "-")}</div>
      <div><b>Lugar exacto:</b> ${escapeHtml(record.lugar_exacto || "-")}</div>
      <div><b>Turno:</b> ${turnoLabel(record.turno)}</div>
      <div><b>Horario:</b> ${escapeHtml(record.horario || "-")}</div>
      <div><b>Licencia:</b> ${escapeHtml(record.licencia || "-")}</div>
      <div><b>Vigencia:</b> ${escapeHtml(record.vigencia || "-")}</div>
    </div>`;
}

function createMarkerIcon(record) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
      <circle cx="14" cy="14" r="11" fill="${colorForGiro(record.giro)}" />
      <circle cx="14" cy="14" r="12.5" fill="none" stroke="${strokeForTurno(record.turno)}" stroke-width="3" />
    </svg>`;

  return L.divIcon({
    className: "leaflet-svg-marker",
    html: svg,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14]
  });
}

function clearMarkers() {
  state.markersLayer.clearLayers();
}

function renderMarkers(data) {
  clearMarkers();

  const validRecords = data.filter((record) => Number.isFinite(record.lat) && Number.isFinite(record.lng));
  if (!validRecords.length) {
    state.map.setView([PACHACAMAC_CENTER.lat, PACHACAMAC_CENTER.lng], 13);
    return;
  }

  const bounds = [];
  validRecords.forEach((record) => {
    const marker = L.marker([record.lat, record.lng], {
      icon: createMarkerIcon(record),
      title: record.nombre
    }).bindPopup(popupHtml(record));

    marker.on("popupopen", () => {
      const markerNode = marker.getElement();
      if (!markerNode) return;
      markerNode.classList.add("pulse");
      window.setTimeout(() => markerNode.classList.remove("pulse"), 480);
    });

    marker.addTo(state.markersLayer);
    bounds.push([record.lat, record.lng]);
  });

  state.map.fitBounds(bounds, { padding: [40, 40] });
}

function getSearchableValues(record) {
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

function applyFilters() {
  const selectedGiro = ui.giroFilter.value;
  const selectedTurno = ui.turnoFilter.value;
  const query = normalizeText(ui.searchInput.value);

  return state.allData.filter((record) => {
    const hasCoords = Number.isFinite(record.lat) && Number.isFinite(record.lng);
    if (!hasCoords) return false;

    const giroMatches = selectedGiro === "todos" || colorKey(record.giro) === colorKey(selectedGiro);
    const turnoMatches = selectedTurno === "todos" || record.turno === selectedTurno;
    const queryMatches = !query || getSearchableValues(record).some((value) => normalizeText(value).includes(query));

    return giroMatches && turnoMatches && queryMatches;
  });
}

function updateStats(filtered) {
  const activeZones = new Set(filtered.map((record) => record.zona).filter(Boolean));
  const missingLocations = state.allData.filter((record) => !Number.isFinite(record.lat) || !Number.isFinite(record.lng)).length;

  ui.totalCount.textContent = String(state.allData.length);
  ui.visibleCount.textContent = String(filtered.length);
  ui.activeZones.textContent = String(activeZones.size);
  ui.missingCount.textContent = String(missingLocations);
}

function populateGiroFilterAndLegend() {
  const giros = [...new Set(state.allData.map((record) => record.giro).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "es"));

  buildGiroColorMap(giros);

  ui.giroFilter.innerHTML = '<option value="todos">Todos</option>';
  giros.forEach((giro) => {
    const option = document.createElement("option");
    option.value = giro;
    option.textContent = giro;
    ui.giroFilter.appendChild(option);
  });

  ui.legendGiros.innerHTML = "";
  giros.forEach((giro) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "legend-item";
    item.innerHTML = `<span class="legend-dot" style="background:${colorForGiro(giro)}"></span>${escapeHtml(giro)}`;
    item.addEventListener("click", () => {
      ui.giroFilter.value = giro;
      refresh();
    });
    ui.legendGiros.appendChild(item);
  });
}

function refresh() {
  const filtered = applyFilters();
  renderMarkers(filtered);
  updateStats(filtered);

  const hasRecords = state.allData.length > 0;
  ui.btnKml.disabled = !hasRecords;
  ui.btnKmz.disabled = !hasRecords;
  ui.btnXlsx.disabled = !hasRecords;
  ui.btnCsv.disabled = !hasRecords;
}

function getSelectedRecord() {
  if (!state.selectedId) return null;
  return state.allData.find((record) => String(record.id) === String(state.selectedId)) || null;
}

function setCoordPreview(lat, lng) {
  ui.coordPreview.textContent = Number.isFinite(lat) && Number.isFinite(lng)
    ? `Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)}`
    : "Lat: -, Lng: -";
}

function buildPersonLabel(record, hasLocation) {
  const status = hasLocation ? "[OK]" : "[ ]";
  return `${status} ${record.nombre || "Sin nombre"} - ${record.giro || "Sin rubro"}`;
}

function rebuildPersonSelect() {
  const sorted = [...state.allData].sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "", "es"));
  const withoutLocation = sorted.filter((record) => !Number.isFinite(record.lat) || !Number.isFinite(record.lng));
  const withLocation = sorted.filter((record) => Number.isFinite(record.lat) && Number.isFinite(record.lng));

  ui.personSelect.innerHTML = '<option value="">Selecciona una persona...</option>';

  const appendGroup = (label, items, hasLocation) => {
    if (!items.length) return;
    const group = document.createElement("optgroup");
    group.label = label;

    items.forEach((record) => {
      const option = document.createElement("option");
      option.value = String(record.id);
      option.textContent = buildPersonLabel(record, hasLocation);
      group.appendChild(option);
    });

    ui.personSelect.appendChild(group);
  };

  appendGroup("Sin ubicacion", withoutLocation, false);
  appendGroup("Con ubicacion", withLocation, true);

  if (state.selectedId) ui.personSelect.value = String(state.selectedId);
}

function finishAssignMode() {
  state.assignMode = false;
  ui.btnAssign.disabled = false;
  ui.btnAssign.textContent = "Asignar en el mapa";
  document.body.style.cursor = "default";

  if (state.mapClickListener) {
    state.map.off("click", state.mapClickListener);
    state.mapClickListener = null;
  }
}

function enableAssignMode() {
  if (state.assignMode) return;

  const record = getSelectedRecord();
  if (!record) {
    toast("Primero selecciona una persona.", false);
    return;
  }

  state.assignMode = true;
  ui.btnAssign.disabled = true;
  ui.btnAssign.textContent = "Haz click en el mapa...";
  document.body.style.cursor = "crosshair";

  state.mapClickListener = (event) => {
    record.lat = event.latlng.lat;
    record.lng = event.latlng.lng;
    setCoordPreview(record.lat, record.lng);
    rebuildPersonSelect();
    ui.personSelect.value = String(record.id);
    finishAssignMode();
    refresh();
    toast(`Ubicacion actualizada para ${record.nombre || "el registro"}`);
  };

  state.map.on("click", state.mapClickListener);
}

function centerOnSelected() {
  const record = getSelectedRecord();
  if (!record) {
    toast("Selecciona una persona.", false);
    return;
  }

  if (Number.isFinite(record.lat) && Number.isFinite(record.lng)) {
    state.map.flyTo([record.lat, record.lng], 17, { duration: 0.8 });
  } else {
    state.map.flyTo([PACHACAMAC_CENTER.lat, PACHACAMAC_CENTER.lng], 14, { duration: 0.8 });
    toast("La persona seleccionada aun no tiene ubicacion.", false);
  }
}

function clearLocation() {
  const record = getSelectedRecord();
  if (!record) {
    toast("Selecciona una persona.", false);
    return;
  }

  record.lat = null;
  record.lng = null;
  setCoordPreview(null, null);
  rebuildPersonSelect();
  ui.personSelect.value = String(record.id);
  refresh();
  toast(`Ubicacion eliminada para ${record.nombre || "el registro"}`);
}

async function loadFromUrl(fileName) {
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

async function autoLoad() {
  for (const fileName of DATA_CANDIDATES) {
    try {
      const rows = await loadFromUrl(fileName);
      return { rows, filename: fileName };
    } catch (error) {
      // prueba siguiente archivo
    }
  }

  throw new Error(`No se encontro ningun dataset compatible: ${DATA_CANDIDATES.join(", ")}`);
}

function normalizeRows(rows) {
  return rows.map((row, index) => {
    const normalized = {};
    Object.keys(row).forEach((key) => {
      normalized[normalizeKey(key)] = row[key];
    });

    let lat = Number.parseFloat(normalized.lat);
    let lng = Number.parseFloat(normalized.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      const fromUbicacion = parseUbicacion(normalized.ubicacion || normalized.ubicacion_ || normalized["ubicacion"]);
      lat = fromUbicacion.lat;
      lng = fromUbicacion.lng;
    }

    const turno = normalizeTurno(normalized.turno) || inferTurno(normalized.horario);
    const id = String(normalized.id || index + 1);

    return {
      id,
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

function toKmlHex(hex) {
  const color = hex.replace("#", "");
  const r = Number.parseInt(color.slice(0, 2), 16);
  const g = Number.parseInt(color.slice(2, 4), 16);
  const b = Number.parseInt(color.slice(4, 6), 16);
  const part = (value) => value.toString(16).padStart(2, "0");
  return `ff${part(b)}${part(g)}${part(r)}`;
}

function styleId(giro) {
  return `giro_${normalizeKey(giro).replace(/[^a-z0-9_]/g, "") || "sin_rubro"}`;
}

function buildKml(data) {
  const validRecords = data.filter((record) => Number.isFinite(record.lat) && Number.isFinite(record.lng));
  const giros = [...new Set(validRecords.map((record) => record.giro).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "es"));

  const styles = giros.map((giro) => `
    <Style id="${styleId(giro)}">
      <IconStyle><color>${toKmlHex(colorForGiro(giro))}</color><scale>1.2</scale></IconStyle>
      <LabelStyle><scale>0.0</scale></LabelStyle>
    </Style>`).join("\n");

  const buildFolder = (name, subset) => {
    if (!subset.length) return "";

    const placemarks = subset.map((record) => `
      <Placemark>
        <name>${escapeHtml(record.nombre || "Sin nombre")}</name>
        <styleUrl>#${styleId(record.giro)}</styleUrl>
        <description><![CDATA[
          <b>Giro:</b> ${escapeHtml(record.giro || "-")}<br/>
          <b>Productos:</b> ${escapeHtml(record.productos || "-")}<br/>
          <b>Zona:</b> ${escapeHtml(record.zona || "-")}<br/>
          <b>Lugar exacto:</b> ${escapeHtml(record.lugar_exacto || "-")}<br/>
          <b>Turno:</b> ${turnoLabel(record.turno)}<br/>
          <b>Horario:</b> ${escapeHtml(record.horario || "-")}<br/>
          <b>Licencia:</b> ${escapeHtml(record.licencia || "-")}<br/>
          <b>Vigencia:</b> ${escapeHtml(record.vigencia || "-")}
        ]]></description>
        <Point><coordinates>${record.lng},${record.lat},0</coordinates></Point>
      </Placemark>`).join("\n");

    return `<Folder><name>${escapeHtml(name)}</name>${placemarks}</Folder>`;
  };

  const manana = validRecords.filter((record) => record.turno === "manana");
  const tarde = validRecords.filter((record) => record.turno === "tarde");

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Ambulantes - Pachacamac</name>
    ${styles}
    ${buildFolder("Manana", manana)}
    ${buildFolder("Tarde", tarde)}
  </Document>
</kml>`;
}

function downloadBlob(filename, blob) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1500);
}

function getExportDataset() {
  return ui.onlyVisible.checked ? applyFilters() : state.allData;
}

function toExportRows() {
  return state.allData.map((record) => ({
    id: record.id || "",
    nombre: record.nombre || "",
    giro: record.giro || "",
    productos: record.productos || "",
    zona: record.zona || "",
    lugar_exacto: record.lugar_exacto || "",
    ubicacion: Number.isFinite(record.lat) && Number.isFinite(record.lng) ? `${record.lat}, ${record.lng}` : "",
    horario: record.horario || "",
    licencia: record.licencia || "",
    vigencia: record.vigencia || "",
    turno: turnoLabel(record.turno),
    lat: Number.isFinite(record.lat) ? record.lat : "",
    lng: Number.isFinite(record.lng) ? record.lng : ""
  }));
}

function downloadXlsx() {
  const rows = toExportRows();
  const headers = ["id", "nombre", "giro", "productos", "zona", "lugar_exacto", "ubicacion", "horario", "licencia", "vigencia", "turno", "lat", "lng"];
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Ambulantes");
  XLSX.writeFile(workbook, "ambulantes_actualizado.xlsx");
}

function downloadCsv() {
  const rows = toExportRows();
  const headers = ["id", "nombre", "giro", "productos", "zona", "lugar_exacto", "ubicacion", "horario", "licencia", "vigencia", "turno", "lat", "lng"];
  const lines = [headers.join(";")];

  rows.forEach((row) => {
    const serialized = headers.map((header) => {
      const value = String(row[header] ?? "").replace(/"/g, '""');
      return /[;\n"]/.test(value) ? `"${value}"` : value;
    });
    lines.push(serialized.join(";"));
  });

  downloadBlob("ambulantes_actualizado.csv", new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" }));
}

function applyThemeUi(theme) {
  ui.themeIcon.textContent = theme === "dark" ? "☀️" : "🌙";
}

function setLeafletTheme(theme) {
  const config = TILE_LAYERS[theme] || TILE_LAYERS.light;

  if (state.tileLayer) {
    state.map.removeLayer(state.tileLayer);
  }

  state.tileLayer = L.tileLayer(config.url, {
    ...config.options,
    maxZoom: 20
  }).addTo(state.map);
}

function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  window.localStorage.setItem("prefers-theme", theme);
  applyThemeUi(theme);

  if (state.map) {
    setLeafletTheme(theme);
  }
}

function attachUiEvents() {
  ui.giroFilter.addEventListener("change", refresh);
  ui.turnoFilter.addEventListener("change", refresh);
  ui.searchInput.addEventListener("input", refresh);

  ui.btnReset.addEventListener("click", () => {
    ui.giroFilter.value = "todos";
    ui.turnoFilter.value = "todos";
    ui.searchInput.value = "";
    refresh();
  });

  ui.btnLoc.addEventListener("click", () => {
    if (!navigator.geolocation) {
      toast("Geolocalizacion no disponible.", false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        state.map.flyTo([position.coords.latitude, position.coords.longitude], 16, { duration: 0.8 });
      },
      () => toast("No se pudo obtener tu ubicacion.", false),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  });

  ui.personSelect.addEventListener("change", (event) => {
    state.selectedId = event.target.value || "";
    const record = getSelectedRecord();
    setCoordPreview(record ? record.lat : null, record ? record.lng : null);
  });

  ui.btnAssign.addEventListener("click", enableAssignMode);
  ui.btnCenter.addEventListener("click", centerOnSelected);
  ui.btnClear.addEventListener("click", clearLocation);

  ui.themeToggle.addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    setTheme(next);
  });

  ui.btnKml.addEventListener("click", () => {
    const records = getExportDataset().filter((record) => Number.isFinite(record.lat) && Number.isFinite(record.lng));
    if (!records.length) {
      toast("No hay puntos con coordenadas para exportar.", false);
      return;
    }

    downloadBlob("ambulantes_pachacamac.kml", new Blob([buildKml(records)], { type: "application/vnd.google-earth.kml+xml" }));
  });

  ui.btnKmz.addEventListener("click", async () => {
    const records = getExportDataset().filter((record) => Number.isFinite(record.lat) && Number.isFinite(record.lng));
    if (!records.length) {
      toast("No hay puntos con coordenadas para exportar.", false);
      return;
    }

    const zip = new JSZip();
    zip.file("doc.kml", buildKml(records));
    const blob = await zip.generateAsync({ type: "blob" });
    downloadBlob("ambulantes_pachacamac.kmz", blob);
  });

  ui.btnXlsx.addEventListener("click", downloadXlsx);
  ui.btnCsv.addEventListener("click", downloadCsv);

  const resizeObserver = new ResizeObserver(adjustFabOffset);
  resizeObserver.observe(ui.exportBar);
  window.addEventListener("resize", adjustFabOffset);
}

async function loadData() {
  toast("Cargando datos...");

  const { rows, filename } = await autoLoad();
  state.allData = normalizeRows(rows);
  populateGiroFilterAndLegend();
  rebuildPersonSelect();
  refresh();
  toast(`Cargado: ${filename} (${state.allData.length} registros)`);
}

function createMap() {
  state.map = L.map("map", {
    zoomControl: true,
    preferCanvas: true
  }).setView([PACHACAMAC_CENTER.lat, PACHACAMAC_CENTER.lng], 13);

  state.markersLayer = L.layerGroup().addTo(state.map);
  setLeafletTheme(currentTheme());
}

window.initMap = async function initMap() {
  cacheDom();
  adjustFabOffset();

  const savedTheme = window.localStorage.getItem("prefers-theme") || "light";
  setTheme(savedTheme);
  createMap();
  attachUiEvents();

  try {
    await loadData();
  } catch (error) {
    toast(error.message || "No se pudieron cargar los datos.", false);
  }
};
