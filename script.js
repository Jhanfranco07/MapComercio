const DATA_CANDIDATES = [
  "ambulantes_actualizado.csv",
  "ambulantes_actualizado.xlsx",
  "ambulantes.xlsx",
  "ambulantes.csv"
];

const PACHACAMAC_CENTER = { lat: -12.155, lng: -76.87 };
const TURNO_LABELS = { manana: "Mañana", tarde: "Tarde" };
const TURNO_STROKES = { manana: "#f59e0b", tarde: "#6366f1" };
const OVERRIDE_COLORS = { asedipa: "#16a34a" };
const PALETTE_HEX = [
  "#2563eb", "#f97316", "#7c3aed", "#0891b2", "#dc2626", "#ca8a04", "#0f766e", "#be123c",
  "#4f46e5", "#65a30d", "#9333ea", "#0369a1", "#b45309", "#db2777", "#15803d", "#475569",
  "#c2410c", "#0e7490", "#6d28d9", "#a21caf", "#1d4ed8", "#854d0e", "#047857", "#991b1b"
];
const EXPIRED_MARKER_STYLE = {
  color: "#6b7280",
  fillColor: "#9ca3af",
  fillOpacity: 0.45,
  opacity: 0.75,
  dashArray: "4 3"
};

const TILE_LAYERS = {
  light: {
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    options: {
      attribution: '&copy; <a href="https://carto.com/about-carto/" target="_blank" rel="noopener">CARTO</a>, &copy; <a href="http://www.openstreetmap.org/about/" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
    }
  },
  dark: {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    options: {
      attribution: '&copy; <a href="https://carto.com/about-carto/" target="_blank" rel="noopener">CARTO</a>, &copy; <a href="http://www.openstreetmap.org/about/" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
    }
  }
};

const state = {
  map: null,
  tileLayer: null,
  markersLayer: null,
  canvasRenderer: null,
  allData: [],
  selectedId: "",
  assignMode: false,
  mapClickListener: null,
  giroColorMap: {},
  toastTimer: null,
  refreshTimer: null,
  hasFittedBounds: false
};

const ui = {};

function cacheDom() {
  ui.giroFilter = document.getElementById("giroFilter");
  ui.turnoFilter = document.getElementById("turnoFilter");
  ui.searchInput = document.getElementById("searchInput");
  ui.totalCount = document.getElementById("totalCount");
  ui.visibleCount = document.getElementById("visibleCount");
  ui.activeZones = document.getElementById("activeZones");
  ui.historyCount = document.getElementById("historyCount");
  ui.missingCount = document.getElementById("missingCount");
  ui.diagnosticPanel = document.getElementById("diagnosticPanel");
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
  ui.btnFilters = document.getElementById("btnFilters");
  ui.mainFilters = document.getElementById("mainFilters");
  ui.bottomSearch = document.getElementById("bottomSearch");
  ui.bottomMap = document.getElementById("bottomMap");
  ui.searchModule = document.getElementById("searchModule");
  ui.moduleSearchInput = document.getElementById("moduleSearchInput");
  ui.searchResults = document.getElementById("searchResults");
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

function isCompactDevice() {
  return window.innerWidth <= 768 || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
}

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

function recordRubros(record) {
  return Array.isArray(record.rubros) && record.rubros.length ? record.rubros : [record.giro].filter(Boolean);
}

function primaryRubro(record) {
  return recordRubros(record)[0] || record.giro || "Sin rubro";
}

function strokeForTurno(turno) {
  return TURNO_STROKES[turno] || TURNO_STROKES.manana;
}

function turnoLabel(turno) {
  return TURNO_LABELS[turno] || TURNO_LABELS.manana;
}

function popupHtml(record) {
  const history = Array.isArray(record.historial) ? record.historial : [];
  const historyHtml = history.length
    ? `<div class="popup-history">
        <div class="popup-history-title">Autorizaciones anteriores (${history.length})</div>
        ${history.slice(0, 6).map((item) => `
          <div class="popup-history-item">
            <div><b>${escapeHtml(item.licencia || "Sin certificado")}</b></div>
            <div>${escapeHtml(item.vigencia || "-")}</div>
            <div>${escapeHtml(item.lugar_exacto || "-")}</div>
          </div>`).join("")}
        ${history.length > 6 ? `<div class="popup-history-item">+ ${history.length - 6} autorizaciones más</div>` : ""}
      </div>`
    : "";

  return `
    <div class="leaflet-popup-card">
      <div class="leaflet-popup-title">${escapeHtml(record.nombre || "Sin nombre")}</div>
      <div class="popup-current">
        <div><b>Autorización actual:</b> ${escapeHtml(record.licencia || "-")}</div>
        <div><b>Vigencia:</b> ${escapeHtml(record.vigencia || "-")}</div>
        <div><b>Rubro:</b> ${escapeHtml(recordRubros(record).join(" + ") || "-")}</div>
        <div><b>Giro original:</b> ${escapeHtml(record.giro || "-")}</div>
        <div><b>Productos:</b> ${escapeHtml(record.productos || "-")}</div>
        <div><b>Zona:</b> ${escapeHtml(record.zona || "-")}</div>
        <div><b>Lugar exacto:</b> ${escapeHtml(record.lugar_exacto || "-")}</div>
        <div><b>Turno:</b> ${turnoLabel(record.turno)}</div>
        <div><b>Horario:</b> ${escapeHtml(record.horario || "-")}</div>
        <div><b>Total histórico:</b> ${record.authorizationCount || 1}</div>
      </div>
      ${historyHtml}
    </div>`;
}

function popupPermitHtml(record) {
  const history = Array.isArray(record.historial) ? record.historial : [];
  const historyHtml = history.length
    ? `<div class="popup-history">
        <div class="popup-section-title"><span class="material-symbols-outlined" aria-hidden="true">history</span> Historial de autorizaciones (${history.length})</div>
        ${history.slice(0, 6).map((item) => `
          <div class="popup-history-item">
            <span class="history-dot"></span>
            <div>
              <div class="history-license">${escapeHtml(item.licencia || "Sin certificado")}</div>
              <div class="history-meta">${escapeHtml(item.vigencia || "-")}</div>
              <div class="history-place">${escapeHtml(item.lugar_exacto || "-")}</div>
            </div>
          </div>`).join("")}
        ${history.length > 6 ? `<div class="popup-history-more">+ ${history.length - 6} autorizaciones mas</div>` : ""}
      </div>`
    : "";

  return `
    <div class="leaflet-popup-card permit-sheet">
      <div class="permit-sheet-header">
        <div>
          <div class="permit-kicker">Comerciante autorizado</div>
          <div class="leaflet-popup-title">${escapeHtml(record.nombre || "Sin nombre")}</div>
        </div>
        <span class="status-chip"><span class="status-dot"></span> Vigente</span>
      </div>
      <div class="permit-summary">
        <div class="permit-metric"><span>Autorizacion actual</span><strong>${escapeHtml(record.licencia || "-")}</strong></div>
        <div class="permit-metric"><span>Vigencia</span><strong>${escapeHtml(record.vigencia || "-")}</strong></div>
      </div>
      <div class="popup-section">
        <div class="popup-section-title"><span class="material-symbols-outlined" aria-hidden="true">storefront</span> Actividad</div>
        <div class="detail-row"><b>Rubro</b><span>${escapeHtml(recordRubros(record).join(" + ") || "-")}</span></div>
        <div class="detail-row"><b>Giro original</b><span>${escapeHtml(record.giro || "-")}</span></div>
        <div class="detail-row"><b>Productos</b><span>${escapeHtml(record.productos || "-")}</span></div>
      </div>
      <div class="popup-section">
        <div class="popup-section-title"><span class="material-symbols-outlined" aria-hidden="true">location_on</span> Ubicacion y horario</div>
        <div class="detail-row"><b>Zona</b><span>${escapeHtml(record.zona || "-")}</span></div>
        <div class="detail-row"><b>Lugar exacto</b><span>${escapeHtml(record.lugar_exacto || "-")}</span></div>
        <div class="detail-row"><b>Turno</b><span>${turnoLabel(record.turno)}</span></div>
        <div class="detail-row"><b>Horario</b><span>${escapeHtml(record.horario || "-")}</span></div>
      </div>
      ${historyHtml}
    </div>`;
}

function parsePermitEndDate(vigencia) {
  const dates = String(vigencia || "").match(/\d{1,2}[/-]\d{1,2}[/-]\d{4}/g) || [];
  const raw = dates[dates.length - 1];
  if (!raw) return null;
  const [day, month, year] = raw.split(/[/-]/).map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function permitStatus(item) {
  const end = parsePermitEndDate(item.vigencia);
  if (!end) return "Vigente";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return end < today ? "Vencido" : "Vigente";
}

function statusClass(status) {
  return status === "Vencido" ? "expired" : "active";
}

function getPermitPanel() {
  let panel = document.getElementById("merchantPanel");
  if (!panel) {
    panel = document.createElement("section");
    panel.id = "merchantPanel";
    panel.className = "merchant-panel";
    panel.setAttribute("aria-live", "polite");
    document.body.appendChild(panel);
  }
  return panel;
}

function closeMerchantPanel() {
  const panel = document.getElementById("merchantPanel");
  if (panel) panel.classList.remove("open", "detail-mode");
}

function renderPermitHistory(record) {
  const permits = Array.isArray(record.autorizaciones) ? record.autorizaciones : [record];
  return permits.map((item, index) => {
    const status = index === 0 ? permitStatus(item) : "Vencido";
    return `
      <article class="permit-history-card">
        <div>
          <strong>${escapeHtml(item.licencia || "Sin certificado")}</strong>
          <span>${escapeHtml(item.vigencia || "-")}</span>
          <span>${escapeHtml(item.lugar_exacto || "-")}</span>
        </div>
        <em class="${statusClass(status)}">${status}</em>
      </article>`;
  }).join("");
}

function renderMerchantPanel(record, mode = "summary") {
  const panel = getPermitPanel();
  const currentStatus = permitStatus(record);
  const detail = mode === "detail";
  panel.classList.toggle("detail-mode", detail);
  panel.innerHTML = `
    <div class="merchant-panel-card">
      <div class="panel-handle"></div>
      <div class="panel-header">
        <button class="panel-icon-btn" type="button" data-action="${detail ? "summary" : "close"}">
          <span class="material-symbols-outlined">${detail ? "arrow_back" : "close"}</span>
        </button>
        <div>
          <div class="panel-kicker">${detail ? "Detalle del Comerciante" : "Comerciante seleccionado"}</div>
          <h2>${escapeHtml(record.nombre || "Sin nombre")}</h2>
          ${record.dni ? `<p>DNI ${escapeHtml(record.dni)}</p>` : ""}
        </div>
        <span class="panel-status ${statusClass(currentStatus)}">${currentStatus}</span>
      </div>

      ${
        detail
          ? `
            <div class="detail-card">
              <h3><span class="material-symbols-outlined">assignment</span> Datos del Permiso</h3>
              <div class="detail-row"><b>Numero de autorizacion</b><span>${escapeHtml(record.licencia || "-")}</span></div>
              <div class="detail-row"><b>Vigencia</b><span>${escapeHtml(record.vigencia || "-")}</span></div>
              <div class="detail-row"><b>Rubro</b><span>${escapeHtml(recordRubros(record).join(" + ") || "-")}</span></div>
              <div class="detail-row"><b>Giro original</b><span>${escapeHtml(record.giro || "-")}</span></div>
              <div class="detail-row"><b>Detalle de venta</b><span>${escapeHtml(record.productos || "-")}</span></div>
            </div>
            <div class="detail-card">
              <h3><span class="material-symbols-outlined">location_on</span> Ubicacion</h3>
              <div class="detail-row"><b>Zona</b><span>${escapeHtml(record.zona || "-")}</span></div>
              <div class="detail-row"><b>Lugar exacto</b><span>${escapeHtml(record.lugar_exacto || "-")}</span></div>
              <div class="detail-row"><b>Turno</b><span>${turnoLabel(record.turno)}</span></div>
              <div class="detail-row"><b>Horario</b><span>${escapeHtml(record.horario || "-")}</span></div>
            </div>
            <div class="detail-card">
              <h3><span class="material-symbols-outlined">history</span> Historial de Permisos</h3>
              <div class="permit-history-list">${renderPermitHistory(record)}</div>
            </div>`
          : `
            <div class="summary-grid">
              <div><span>Giro</span><strong>${escapeHtml(recordRubros(record)[0] || "-")}</strong></div>
              <div><span>Ubicacion</span><strong>${escapeHtml(record.zona || "-")}</strong></div>
            </div>
            <div class="summary-actions">
              <button class="btn primary" type="button" data-action="detail"><span class="material-symbols-outlined">visibility</span> Ver detalle</button>
              <button class="btn" type="button" data-action="history"><span class="material-symbols-outlined">history</span> Ver historial</button>
            </div>`
      }
    </div>`;

  panel.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.getAttribute("data-action");
      if (action === "close") closeMerchantPanel();
      if (action === "detail" || action === "history") renderMerchantPanel(record, "detail");
      if (action === "summary") renderMerchantPanel(record, "summary");
    });
  });
  panel.classList.add("open");
}

function searchMatches(record, query) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return true;
  return getSearchableValues(record).some((value) => normalizeText(value).includes(normalizedQuery));
}

function renderSearchResults(query = "") {
  if (!ui.searchResults) return;
  const records = state.allData.filter((record) => searchMatches(record, query));
  ui.searchResults.innerHTML = records.length
    ? records.map((record) => {
        const status = permitStatus(record);
        return `
          <article class="merchant-card" data-id="${escapeHtml(record.id)}">
            <div class="merchant-thumb"><span class="material-symbols-outlined">storefront</span></div>
            <div class="merchant-card-body">
              <div class="merchant-card-top">
                <h3>${escapeHtml(record.nombre || "Sin nombre")}</h3>
                <span class="panel-status ${statusClass(status)}">${status}</span>
              </div>
              <p>${escapeHtml(recordRubros(record).join(" + ") || record.giro || "-")}</p>
              <span><span class="material-symbols-outlined">location_on</span>${escapeHtml(record.lugar_exacto || record.zona || "-")}</span>
              <small>${escapeHtml(record.licencia || "-")} · ${escapeHtml(record.vigencia || "-")}</small>
            </div>
          </article>`;
      }).join("")
    : `<div class="empty-results">No se encontraron permisos con esa busqueda.</div>`;

  ui.searchResults.querySelectorAll(".merchant-card").forEach((card) => {
    card.addEventListener("click", () => {
      const record = state.allData.find((item) => String(item.id) === card.dataset.id);
      if (record) renderMerchantPanel(record, "detail");
    });
  });
}

function setAppMode(mode) {
  document.body.classList.toggle("search-mode", mode === "search");
  ui.bottomSearch?.classList.toggle("active", mode === "search");
  ui.bottomMap?.classList.toggle("active", mode !== "search");
  closeMerchantPanel();
  if (mode === "search") {
    renderSearchResults(ui.moduleSearchInput?.value || "");
    window.setTimeout(() => ui.moduleSearchInput?.focus(), 50);
  }
}

function clearMarkers() {
  state.markersLayer.clearLayers();
}

function renderMarkers(data, fitView = false) {
  clearMarkers();

  const validRecords = data.filter((record) => Number.isFinite(record.lat) && Number.isFinite(record.lng));
  if (!validRecords.length) {
    if (fitView || !state.hasFittedBounds) {
      state.map.setView([PACHACAMAC_CENTER.lat, PACHACAMAC_CENTER.lng], 13, { animate: false });
    }
    return;
  }

  const compactDevice = isCompactDevice();
  const bounds = [];
  validRecords.forEach((record) => {
    const isExpired = permitStatus(record) === "Vencido";
    const marker = L.circleMarker([record.lat, record.lng], {
      renderer: state.canvasRenderer,
      radius: isExpired ? (compactDevice ? 6 : 7) : (compactDevice ? 7 : 8),
      weight: compactDevice ? 3 : 4,
      color: isExpired ? EXPIRED_MARKER_STYLE.color : strokeForTurno(record.turno),
      fillColor: isExpired ? EXPIRED_MARKER_STYLE.fillColor : colorForGiro(primaryRubro(record)),
      fillOpacity: isExpired ? EXPIRED_MARKER_STYLE.fillOpacity : 0.92,
      opacity: isExpired ? EXPIRED_MARKER_STYLE.opacity : 0.95,
      dashArray: isExpired ? EXPIRED_MARKER_STYLE.dashArray : null,
      bubblingMouseEvents: false
    });

    marker.on("click", () => renderMerchantPanel(record, "summary"));

    marker.addTo(state.markersLayer);
    bounds.push([record.lat, record.lng]);
  });

  if (fitView) {
    state.map.fitBounds(bounds, {
      padding: compactDevice ? [24, 24] : [36, 36],
      maxZoom: compactDevice ? 16 : 17,
      animate: false
    });
    state.hasFittedBounds = true;
  }
}

function getSearchableValues(record) {
  const permits = Array.isArray(record.autorizaciones) ? record.autorizaciones : [];
  return [
    record.nombre,
    record.productos,
    record.zona,
    record.giro,
    ...(Array.isArray(record.rubros) ? record.rubros : []),
    record.lugar_exacto,
    record.horario,
    record.licencia,
    record.vigencia,
    ...permits.flatMap((item) => [
      item.licencia,
      item.vigencia,
      item.giro,
      item.productos,
      item.lugar_exacto,
      permitStatus(item)
    ])
  ];
}

function applyFilters() {
  const selectedGiro = ui.giroFilter.value;
  const selectedTurno = ui.turnoFilter.value;
  const query = normalizeText(ui.searchInput.value);

  return state.allData.filter((record) => {
    const hasCoords = Number.isFinite(record.lat) && Number.isFinite(record.lng);
    if (!hasCoords) return false;

    const giroMatches = selectedGiro === "todos" || recordRubros(record).some((rubro) => colorKey(rubro) === colorKey(selectedGiro));
    const turnoMatches = selectedTurno === "todos" || record.turno === selectedTurno;
    const queryMatches = !query || getSearchableValues(record).some((value) => normalizeText(value).includes(query));

    return giroMatches && turnoMatches && queryMatches;
  });
}

function updateStats(filtered) {
  const activeZones = new Set(filtered.map((record) => record.zona).filter(Boolean));
  const missingLocations = state.allData.filter((record) => !Number.isFinite(record.lat) || !Number.isFinite(record.lng)).length;
  const historical = state.allData.reduce((sum, record) => sum + Math.max((record.authorizationCount || 1) - 1, 0), 0);

  ui.totalCount.textContent = String(state.allData.length);
  ui.visibleCount.textContent = String(filtered.length);
  ui.activeZones.textContent = String(activeZones.size);
  if (ui.historyCount) ui.historyCount.textContent = String(historical);
  ui.missingCount.textContent = String(missingLocations);
}

function populateGiroFilterAndLegend() {
  const giros = [...new Set(state.allData.flatMap((record) => recordRubros(record)).filter(Boolean))]
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
  const expiredItem = document.createElement("span");
  expiredItem.className = "legend-item static";
  expiredItem.innerHTML = '<span class="legend-dot expired"></span>Vencidos';
  ui.legendGiros.appendChild(expiredItem);

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
  renderMarkers(filtered, false);
  updateStats(filtered);

  const hasRecords = state.allData.length > 0;
  ui.btnKml.disabled = !hasRecords;
  ui.btnKmz.disabled = !hasRecords;
  ui.btnXlsx.disabled = !hasRecords;
  ui.btnCsv.disabled = !hasRecords;
}

function refreshAndFit() {
  const filtered = applyFilters();
  renderMarkers(filtered, true);
  updateStats(filtered);

  const hasRecords = state.allData.length > 0;
  ui.btnKml.disabled = !hasRecords;
  ui.btnKmz.disabled = !hasRecords;
  ui.btnXlsx.disabled = !hasRecords;
  ui.btnCsv.disabled = !hasRecords;
}

function scheduleRefresh(fitView = false) {
  window.clearTimeout(state.refreshTimer);
  state.refreshTimer = window.setTimeout(() => {
    if (fitView) {
      refreshAndFit();
      return;
    }
    refresh();
  }, 80);
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
  const count = record.authorizationCount > 1 ? ` (${record.authorizationCount} autorizaciones)` : "";
  return `${status} ${record.nombre || "Sin nombre"} - ${recordRubros(record).join(" + ") || "Sin rubro"}${count}`;
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

  appendGroup("Sin ubicación", withoutLocation, false);
  appendGroup("Con ubicación", withLocation, true);

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
    toast("La persona seleccionada aún no tiene ubicación.", false);
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
  const giros = [...new Set(validRecords.flatMap((record) => recordRubros(record)).filter(Boolean))]
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
        <styleUrl>#${styleId(primaryRubro(record))}</styleUrl>
        <description><![CDATA[
          <b>Rubro:</b> ${escapeHtml(recordRubros(record).join(" + ") || "-")}<br/>
          <b>Giro original:</b> ${escapeHtml(record.giro || "-")}<br/>
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
    <name>Ambulantes - Pachacámac</name>
    ${styles}
    ${buildFolder("Mañana", manana)}
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
  const rows = [];
  state.allData.forEach((record) => {
    const authorizations = Array.isArray(record.autorizaciones) ? record.autorizaciones : [record];
    authorizations.forEach((item, index) => rows.push({
    id: record.id || "",
    nombre: item.nombre || "",
    giro: item.giro || "",
    rubros: Array.isArray(item.rubros) ? item.rubros.join(" + ") : "",
    productos: item.productos || "",
    zona: item.zona || "",
    lugar_exacto: item.lugar_exacto || "",
    ubicacion: Number.isFinite(item.lat) && Number.isFinite(item.lng) ? `${item.lat}, ${item.lng}` : "",
    horario: item.horario || "",
    licencia: item.licencia || "",
    vigencia: item.vigencia || "",
    turno: turnoLabel(item.turno),
    estado_autorizacion: index === 0 ? "Actual" : "Historica",
    lat: Number.isFinite(item.lat) ? item.lat : "",
    lng: Number.isFinite(item.lng) ? item.lng : ""
    }));
  });
  return rows;
}

function downloadXlsx() {
  const rows = toExportRows();
  const headers = ["id", "nombre", "rubros", "giro", "productos", "zona", "lugar_exacto", "ubicacion", "horario", "licencia", "vigencia", "turno", "estado_autorizacion", "lat", "lng"];
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Ambulantes");
  XLSX.writeFile(workbook, "ambulantes_actualizado.xlsx");
}

function downloadCsv() {
  const rows = toExportRows();
  const headers = ["id", "nombre", "rubros", "giro", "productos", "zona", "lugar_exacto", "ubicacion", "horario", "licencia", "vigencia", "turno", "estado_autorizacion", "lat", "lng"];
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
  ui.themeIcon.textContent = theme === "dark" ? "light_mode" : "dark_mode";
}

function setLeafletTheme(theme) {
  const config = TILE_LAYERS[theme] || TILE_LAYERS.light;

  if (state.tileLayer) {
    state.map.removeLayer(state.tileLayer);
  }

  state.tileLayer = L.tileLayer(config.url, {
    ...config.options,
    maxZoom: 20,
    updateWhenIdle: true,
    keepBuffer: isCompactDevice() ? 1 : 2
  }).addTo(state.map);
}

function setMobileFiltersOpen(forceOpen) {
  if (!ui.mainFilters || !ui.btnFilters) return;

  if (window.innerWidth > 768) {
    ui.mainFilters.classList.remove("mobile-collapsed");
    ui.btnFilters.setAttribute("aria-expanded", "true");
    return;
  }

  const shouldOpen = typeof forceOpen === "boolean"
    ? forceOpen
    : ui.mainFilters.classList.contains("mobile-collapsed");

  ui.mainFilters.classList.toggle("mobile-collapsed", !shouldOpen);
  ui.btnFilters.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
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
  ui.searchInput.addEventListener("input", () => scheduleRefresh(false));

  ui.btnReset.addEventListener("click", () => {
    ui.giroFilter.value = "todos";
    ui.turnoFilter.value = "todos";
    ui.searchInput.value = "";
    refreshAndFit();
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
      () => toast("No se pudo obtener tu ubicación.", false),
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

  ui.btnFilters?.addEventListener("click", () => {
    const opening = ui.mainFilters.classList.contains("mobile-collapsed");
    setMobileFiltersOpen(opening);
  });

  ui.bottomSearch?.addEventListener("click", () => {
    setAppMode("search");
  });

  ui.bottomMap?.addEventListener("click", () => setAppMode("map"));

  ui.moduleSearchInput?.addEventListener("input", () => renderSearchResults(ui.moduleSearchInput.value));

  document.querySelectorAll(".quick-filters button").forEach((button) => {
    button.addEventListener("click", () => {
      const query = button.getAttribute("data-query") || "";
      ui.moduleSearchInput.value = query;
      renderSearchResults(query);
    });
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
  window.addEventListener("resize", () => {
    adjustFabOffset();
    if (window.innerWidth > 768) {
      setMobileFiltersOpen(true);
    }
  });
}

function renderDiagnostics(diagnostics) {
  if (!ui.diagnosticPanel || !diagnostics) return;

  const missingColumns = diagnostics.missingRequiredColumns || [];
  const invalidRows = diagnostics.invalidCoordinateRows || [];
  const sourceLabel = diagnostics.source === "google_sheets+local_backup"
    ? `Google Sheets + ${diagnostics.filename || "respaldo local"}`
    : diagnostics.source === "google_sheets"
    ? "Google Sheets / Autorizaciones_CA"
    : `Respaldo local ${diagnostics.filename || ""}`.trim();

  ui.diagnosticPanel.classList.add("show");
  ui.diagnosticPanel.innerHTML = `
    <h2>Diagnóstico de datos</h2>
    <div class="diagnostic-grid">
      <div class="diagnostic-metric"><span>Fuente</span><strong>${escapeHtml(sourceLabel)}</strong></div>
      <div class="diagnostic-metric"><span>Filas leídas</span><strong>${diagnostics.rawRows}</strong></div>
      <div class="diagnostic-metric"><span>Personas agrupadas</span><strong>${diagnostics.people}</strong></div>
      <div class="diagnostic-metric"><span>Con coordenadas</span><strong>${diagnostics.currentWithCoordinates}</strong></div>
      <div class="diagnostic-metric"><span>Sin coordenadas</span><strong>${diagnostics.withoutCoordinates}</strong></div>
      <div class="diagnostic-metric"><span>Personas repetidas</span><strong>${diagnostics.repeatedPeople}</strong></div>
      <div class="diagnostic-metric"><span>Autorizaciones históricas</span><strong>${diagnostics.historicalAuthorizations}</strong></div>
      ${
        diagnostics.sourceRules
          ? `
            <div class="diagnostic-metric"><span>Sheets 2026</span><strong>${diagnostics.sourceRules.googleSheetsRowsAfterFilter}/${diagnostics.sourceRules.googleSheetsRowsBeforeFilter}</strong></div>
            <div class="diagnostic-metric"><span>CSV 2025</span><strong>${diagnostics.sourceRules.localRowsAfterFilter}/${diagnostics.sourceRules.localRowsBeforeFilter}</strong></div>
            <div class="diagnostic-metric"><span>Detalle desde CSV</span><strong>${diagnostics.sourceRules.detailsFilledFromCsv}</strong></div>
          `
          : ""
      }
    </div>
    ${
      diagnostics.fallbackReason
        ? `<ul class="diagnostic-list"><li>No se pudo usar Sheets: ${escapeHtml(diagnostics.fallbackReason)}. Se usó el respaldo local.</li></ul>`
        : ""
    }
    ${
      diagnostics.partialLoadErrors?.length
        ? `<ul class="diagnostic-list">${diagnostics.partialLoadErrors.map((msg) =>
            `<li>${escapeHtml(msg)}</li>`
          ).join("")}</ul>`
        : ""
    }
    ${
      missingColumns.length
        ? `<ul class="diagnostic-list"><li>Columnas esperadas no encontradas: ${missingColumns.map(escapeHtml).join(", ")}</li></ul>`
        : ""
    }
    ${
      invalidRows.length
        ? `<ul class="diagnostic-list">${invalidRows.slice(0, 8).map((row) =>
            `<li>Fila ${escapeHtml(row.fila)} sin coordenada válida: ${escapeHtml(row.nombre || "Sin nombre")} ${escapeHtml(row.certificado || "")}</li>`
          ).join("")}</ul>`
        : ""
    }
  `;
}

async function loadData() {
  toast("Cargando datos...");

  const dataset = await window.MapComercioData.loadAmbulantesDataset();
  state.allData = dataset.records;
  populateGiroFilterAndLegend();
  rebuildPersonSelect();
  renderDiagnostics(dataset.diagnostics);
  renderSearchResults("");
  refreshAndFit();
  const sourceLabel = dataset.diagnostics.source === "google_sheets+local_backup"
    ? "Google Sheets + CSV"
    : dataset.diagnostics.source === "google_sheets"
      ? "Google Sheets"
      : dataset.diagnostics.filename;
  toast(`Cargado: ${sourceLabel} (${state.allData.length} personas)`);
}

function createMap() {
  state.map = L.map("map", {
    zoomControl: true,
    preferCanvas: true,
    zoomAnimation: false,
    fadeAnimation: false,
    markerZoomAnimation: false,
    inertia: false
  }).setView([PACHACAMAC_CENTER.lat, PACHACAMAC_CENTER.lng], 13, { animate: false });

  state.canvasRenderer = L.canvas({ padding: 0.25 });
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
  setMobileFiltersOpen(window.innerWidth > 768);

  try {
    await loadData();
  } catch (error) {
    toast(error.message || "No se pudieron cargar los datos.", false);
  }
};
