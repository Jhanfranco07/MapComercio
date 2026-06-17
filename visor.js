const VISOR_DATA_CANDIDATES = [
  "ambulantes_actualizado.csv",
  "ambulantes_actualizado.xlsx",
  "ambulantes.xlsx",
  "ambulantes.csv"
];

const VISOR_CENTER = { lat: -12.155, lng: -76.87 };
const VISOR_TURNO_LABELS = { manana: "Mañana", tarde: "Tarde" };
const VISOR_TURNO_STROKES = { manana: "#f59e0b", tarde: "#6366f1" };
const VISOR_OVERRIDE_COLORS = { asedipa: "#16a34a" };
const VISOR_PALETTE = [
  "#2563eb", "#f97316", "#7c3aed", "#0891b2", "#dc2626", "#ca8a04", "#0f766e", "#be123c",
  "#4f46e5", "#65a30d", "#9333ea", "#0369a1", "#b45309", "#db2777", "#15803d", "#475569",
  "#c2410c", "#0e7490", "#6d28d9", "#a21caf", "#1d4ed8", "#854d0e", "#047857", "#991b1b"
];
const VISOR_EXPIRED_MARKER_STYLE = {
  color: "#6b7280",
  fillColor: "#9ca3af",
  fillOpacity: 0.45,
  opacity: 0.75,
  dashArray: "4 3"
};

const VISOR_TILE_LAYERS = {
  light: {
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    options: { attribution: '&copy; <a href="https://carto.com/about-carto/" target="_blank" rel="noopener">CARTO</a>, &copy; <a href="http://www.openstreetmap.org/about/" target="_blank" rel="noopener">OpenStreetMap</a> contributors' }
  },
  dark: {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    options: { attribution: '&copy; <a href="https://carto.com/about-carto/" target="_blank" rel="noopener">CARTO</a>, &copy; <a href="http://www.openstreetmap.org/about/" target="_blank" rel="noopener">OpenStreetMap</a> contributors' }
  }
};

const visorState = {
  map: null,
  tileLayer: null,
  markersLayer: null,
  canvasRenderer: null,
  allData: [],
  giroColorMap: {},
  toastTimer: null,
  refreshTimer: null,
  hasFittedBounds: false
};

const visorUi = {};

function cacheVisorDom() {
  visorUi.giroFilter = document.getElementById("giroFilter");
  visorUi.turnoFilter = document.getElementById("turnoFilter");
  visorUi.mapModeInputs = Array.from(document.querySelectorAll('input[name="mapMode"]'));
  visorUi.searchInput = document.getElementById("searchInput");
  visorUi.totalCount = document.getElementById("totalCount");
  visorUi.visibleCount = document.getElementById("visibleCount");
  visorUi.activeZones = document.getElementById("activeZones");
  visorUi.historyCount = document.getElementById("historyCount");
  visorUi.legendGiros = document.getElementById("legendGiros");
  visorUi.btnReset = document.getElementById("btnReset");
  visorUi.btnLoc = document.getElementById("btnLoc");
  visorUi.themeToggle = document.getElementById("themeToggle");
  visorUi.themeIcon = document.getElementById("themeIcon");
  visorUi.toast = document.getElementById("toast");
  visorUi.btnFilters = document.getElementById("btnFilters");
  visorUi.mainFilters = document.getElementById("viewerFilters");
  visorUi.bottomSearch = document.getElementById("bottomSearch");
  visorUi.bottomMap = document.getElementById("bottomMap");
  visorUi.searchModule = document.getElementById("searchModule");
  visorUi.moduleSearchInput = document.getElementById("moduleSearchInput");
  visorUi.searchResults = document.getElementById("searchResults");
}

function visorCurrentMapMode() {
  return visorUi.mapModeInputs.find((input) => input.checked)?.value || "vigentes";
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

function visorIsCompactDevice() {
  return window.innerWidth <= 768 || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
}

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

function visorRecordRubros(record) {
  return Array.isArray(record.rubros) && record.rubros.length ? record.rubros : [record.giro].filter(Boolean);
}

function visorPrimaryRubro(record) {
  return visorRecordRubros(record)[0] || record.giro || "Sin rubro";
}

function visorStrokeForTurno(turno) {
  return VISOR_TURNO_STROKES[turno] || VISOR_TURNO_STROKES.manana;
}

function visorTurnoLabel(turno) {
  return VISOR_TURNO_LABELS[turno] || VISOR_TURNO_LABELS.manana;
}

function visorPopupHtml(record) {
  const history = Array.isArray(record.historial) ? record.historial : [];
  const historyHtml = history.length
    ? `<div class="popup-history">
        <div class="popup-history-title">Autorizaciones anteriores (${history.length})</div>
        ${history.slice(0, 6).map((item) => `
          <div class="popup-history-item">
            <div><b>${visorEscapeHtml(item.licencia || "Sin certificado")}</b></div>
            <div>${visorEscapeHtml(item.vigencia || "-")}</div>
            <div>${visorEscapeHtml(item.lugar_exacto || "-")}</div>
          </div>`).join("")}
        ${history.length > 6 ? `<div class="popup-history-item">+ ${history.length - 6} autorizaciones mas</div>` : ""}
      </div>`
    : "";

  return `
    <div class="leaflet-popup-card">
      <div class="leaflet-popup-title">${visorEscapeHtml(record.nombre || "Sin nombre")}</div>
      <div class="popup-current">
        <div><b>Autorización actual:</b> ${visorEscapeHtml(record.licencia || "-")}</div>
        <div><b>Vigencia:</b> ${visorEscapeHtml(record.vigencia || "-")}</div>
        <div><b>Rubro:</b> ${visorEscapeHtml(visorRecordRubros(record).join(" + ") || "-")}</div>
        <div><b>Giro original:</b> ${visorEscapeHtml(record.giro || "-")}</div>
        <div><b>Productos:</b> ${visorEscapeHtml(record.productos || "-")}</div>
        <div><b>Zona:</b> ${visorEscapeHtml(record.zona || "-")}</div>
        <div><b>Lugar exacto:</b> ${visorEscapeHtml(record.lugar_exacto || "-")}</div>
        <div><b>Turno:</b> ${visorTurnoLabel(record.turno)}</div>
        <div><b>Horario:</b> ${visorEscapeHtml(record.horario || "-")}</div>
      </div>
      ${historyHtml}
    </div>`;
}

function visorPopupPermitHtml(record) {
  const history = Array.isArray(record.historial) ? record.historial : [];
  const historyHtml = history.length
    ? `<div class="popup-history">
        <div class="popup-section-title"><span class="material-symbols-outlined" aria-hidden="true">history</span> Historial de autorizaciones (${history.length})</div>
        ${history.slice(0, 6).map((item) => `
          <div class="popup-history-item">
            <span class="history-dot"></span>
            <div>
              <div class="history-license">${visorEscapeHtml(item.licencia || "Sin certificado")}</div>
              <div class="history-meta">${visorEscapeHtml(item.vigencia || "-")}</div>
              <div class="history-place">${visorEscapeHtml(item.lugar_exacto || "-")}</div>
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
          <div class="leaflet-popup-title">${visorEscapeHtml(record.nombre || "Sin nombre")}</div>
        </div>
        <span class="status-chip"><span class="status-dot"></span> Vigente</span>
      </div>
      <div class="permit-summary">
        <div class="permit-metric"><span>Autorizacion actual</span><strong>${visorEscapeHtml(record.licencia || "-")}</strong></div>
        <div class="permit-metric"><span>Vigencia</span><strong>${visorEscapeHtml(record.vigencia || "-")}</strong></div>
      </div>
      <div class="popup-section">
        <div class="popup-section-title"><span class="material-symbols-outlined" aria-hidden="true">storefront</span> Actividad</div>
        <div class="detail-row"><b>Rubro</b><span>${visorEscapeHtml(visorRecordRubros(record).join(" + ") || "-")}</span></div>
        <div class="detail-row"><b>Giro original</b><span>${visorEscapeHtml(record.giro || "-")}</span></div>
        <div class="detail-row"><b>Productos</b><span>${visorEscapeHtml(record.productos || "-")}</span></div>
      </div>
      <div class="popup-section">
        <div class="popup-section-title"><span class="material-symbols-outlined" aria-hidden="true">location_on</span> Ubicacion y horario</div>
        <div class="detail-row"><b>Zona</b><span>${visorEscapeHtml(record.zona || "-")}</span></div>
        <div class="detail-row"><b>Lugar exacto</b><span>${visorEscapeHtml(record.lugar_exacto || "-")}</span></div>
        <div class="detail-row"><b>Turno</b><span>${visorTurnoLabel(record.turno)}</span></div>
        <div class="detail-row"><b>Horario</b><span>${visorEscapeHtml(record.horario || "-")}</span></div>
      </div>
      ${historyHtml}
    </div>`;
}

function visorParsePermitEndDate(vigencia) {
  const dates = String(vigencia || "").match(/\d{1,2}[/-]\d{1,2}[/-]\d{4}/g) || [];
  const raw = dates[dates.length - 1];
  if (!raw) return null;
  const [day, month, year] = raw.split(/[/-]/).map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function visorPermitStatus(item) {
  const end = visorParsePermitEndDate(item.vigencia);
  if (!end) return "Vigente";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return end < today ? "Vencido" : "Vigente";
}

function visorStatusClass(status) {
  return status === "Vencido" ? "expired" : "active";
}

function visorGetPermitPanel() {
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

function visorCloseMerchantPanel() {
  const panel = document.getElementById("merchantPanel");
  if (panel) panel.classList.remove("open", "detail-mode");
}

function visorRenderPermitHistory(record) {
  const permits = Array.isArray(record.autorizaciones) ? record.autorizaciones : [record];
  return permits.map((item, index) => {
    const status = index === 0 ? visorPermitStatus(item) : "Vencido";
    return `
      <article class="permit-history-card">
        <div>
          <strong>${visorEscapeHtml(item.licencia || "Sin certificado")}</strong>
          <span>${visorEscapeHtml(item.vigencia || "-")}</span>
          <span>${visorEscapeHtml(item.lugar_exacto || "-")}</span>
        </div>
        <em class="${visorStatusClass(status)}">${status}</em>
      </article>`;
  }).join("");
}

function visorRenderMerchantPanel(record, mode = "summary") {
  const panel = visorGetPermitPanel();
  const currentStatus = visorPermitStatus(record);
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
          <h2>${visorEscapeHtml(record.nombre || "Sin nombre")}</h2>
          ${record.dni ? `<p>DNI ${visorEscapeHtml(record.dni)}</p>` : ""}
        </div>
        <span class="panel-status ${visorStatusClass(currentStatus)}">${currentStatus}</span>
      </div>

      ${
        detail
          ? `
            <div class="detail-card">
              <h3><span class="material-symbols-outlined">assignment</span> Datos del Permiso</h3>
              <div class="detail-row"><b>Numero de autorizacion</b><span>${visorEscapeHtml(record.licencia || "-")}</span></div>
              <div class="detail-row"><b>Vigencia</b><span>${visorEscapeHtml(record.vigencia || "-")}</span></div>
              <div class="detail-row"><b>Rubro</b><span>${visorEscapeHtml(visorRecordRubros(record).join(" + ") || "-")}</span></div>
              <div class="detail-row"><b>Giro original</b><span>${visorEscapeHtml(record.giro || "-")}</span></div>
              <div class="detail-row"><b>Detalle de venta</b><span>${visorEscapeHtml(record.productos || "-")}</span></div>
            </div>
            <div class="detail-card">
              <h3><span class="material-symbols-outlined">location_on</span> Ubicacion</h3>
              <div class="detail-row"><b>Zona</b><span>${visorEscapeHtml(record.zona || "-")}</span></div>
              <div class="detail-row"><b>Lugar exacto</b><span>${visorEscapeHtml(record.lugar_exacto || "-")}</span></div>
              <div class="detail-row"><b>Turno</b><span>${visorTurnoLabel(record.turno)}</span></div>
              <div class="detail-row"><b>Horario</b><span>${visorEscapeHtml(record.horario || "-")}</span></div>
            </div>
            <div class="detail-card">
              <h3><span class="material-symbols-outlined">history</span> Historial de Permisos</h3>
              <div class="permit-history-list">${visorRenderPermitHistory(record)}</div>
            </div>`
          : `
            <div class="summary-grid">
              <div><span>Giro</span><strong>${visorEscapeHtml(visorRecordRubros(record)[0] || "-")}</strong></div>
              <div><span>Ubicacion</span><strong>${visorEscapeHtml(record.zona || "-")}</strong></div>
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
      if (action === "close") visorCloseMerchantPanel();
      if (action === "detail" || action === "history") visorRenderMerchantPanel(record, "detail");
      if (action === "summary") visorRenderMerchantPanel(record, "summary");
    });
  });
  panel.classList.add("open");
}

function visorSearchMatches(record, query) {
  const normalizedQuery = visorNormalizeText(query);
  if (!normalizedQuery) return true;

  const statusAliases = {
    VENCIDO: "VENCIDO",
    VENCIDOS: "VENCIDO",
    VIGENTE: "VIGENTE",
    VIGENTES: "VIGENTE",
    TRAMITE: "TRAMITE",
    "EN TRAMITE": "TRAMITE"
  };
  const requestedStatus = statusAliases[normalizedQuery];
  if (requestedStatus) {
    return visorNormalizeText(visorPermitStatus(record)).includes(requestedStatus);
  }

  return visorGetSearchableValues(record).some((value) => visorNormalizeText(value).includes(normalizedQuery));
}

function visorRenderSearchResults(query = "") {
  if (!visorUi.searchResults) return;
  const records = visorState.allData.filter((record) => visorSearchMatches(record, query));
  visorUi.searchResults.innerHTML = records.length
    ? records.map((record) => {
        const status = visorPermitStatus(record);
        return `
          <article class="merchant-card" data-id="${visorEscapeHtml(record.id)}">
            <div class="merchant-thumb"><span class="material-symbols-outlined">storefront</span></div>
            <div class="merchant-card-body">
              <div class="merchant-card-top">
                <h3>${visorEscapeHtml(record.nombre || "Sin nombre")}</h3>
                <span class="panel-status ${visorStatusClass(status)}">${status}</span>
              </div>
              <p>${visorEscapeHtml(visorRecordRubros(record).join(" + ") || record.giro || "-")}</p>
              <span><span class="material-symbols-outlined">location_on</span>${visorEscapeHtml(record.lugar_exacto || record.zona || "-")}</span>
              <small>${visorEscapeHtml(record.licencia || "-")} · ${visorEscapeHtml(record.vigencia || "-")}</small>
            </div>
          </article>`;
      }).join("")
    : `<div class="empty-results">No se encontraron permisos con esa busqueda.</div>`;

  visorUi.searchResults.querySelectorAll(".merchant-card").forEach((card) => {
    card.addEventListener("click", () => {
      const record = visorState.allData.find((item) => String(item.id) === card.dataset.id);
      if (record) visorRenderMerchantPanel(record, "detail");
    });
  });
}

function visorSetAppMode(mode) {
  document.body.classList.toggle("search-mode", mode === "search");
  visorUi.bottomSearch?.classList.toggle("active", mode === "search");
  visorUi.bottomMap?.classList.toggle("active", mode !== "search");
  visorCloseMerchantPanel();
  if (mode === "search") {
    visorRenderSearchResults(visorUi.moduleSearchInput?.value || "");
    window.setTimeout(() => visorUi.moduleSearchInput?.focus(), 50);
  }
}

function visorClearMarkers() {
  visorState.markersLayer.clearLayers();
}

function visorRenderMarkers(data, fitView = false) {
  visorClearMarkers();
  const validRecords = data.filter((record) => Number.isFinite(record.lat) && Number.isFinite(record.lng));

  if (!validRecords.length) {
    if (fitView || !visorState.hasFittedBounds) {
      visorState.map.setView([VISOR_CENTER.lat, VISOR_CENTER.lng], 13, { animate: false });
    }
    return;
  }

  const compactDevice = visorIsCompactDevice();
  const bounds = [];

  validRecords.forEach((record) => {
    const isExpired = visorPermitStatus(record) === "Vencido";
    const marker = L.circleMarker([record.lat, record.lng], {
      renderer: visorState.canvasRenderer,
      radius: isExpired ? (compactDevice ? 6 : 7) : (compactDevice ? 7 : 8),
      weight: compactDevice ? 3 : 4,
      color: isExpired ? VISOR_EXPIRED_MARKER_STYLE.color : visorStrokeForTurno(record.turno),
      fillColor: isExpired ? VISOR_EXPIRED_MARKER_STYLE.fillColor : visorColorForGiro(visorPrimaryRubro(record)),
      fillOpacity: isExpired ? VISOR_EXPIRED_MARKER_STYLE.fillOpacity : 0.92,
      opacity: isExpired ? VISOR_EXPIRED_MARKER_STYLE.opacity : 0.95,
      dashArray: isExpired ? VISOR_EXPIRED_MARKER_STYLE.dashArray : null,
      bubblingMouseEvents: false
    });

    marker.on("click", () => visorRenderMerchantPanel(record, "summary"));

    marker.addTo(visorState.markersLayer);
    bounds.push([record.lat, record.lng]);
  });

  if (fitView) {
    visorState.map.fitBounds(bounds, {
      padding: compactDevice ? [24, 24] : [36, 36],
      maxZoom: compactDevice ? 16 : 17,
      animate: false
    });
    visorState.hasFittedBounds = true;
  }
}

function visorGetSearchableValues(record) {
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
    visorPermitStatus(record),
    ...permits.flatMap((item) => [
      item.licencia,
      item.vigencia,
      item.giro,
      item.productos,
      item.lugar_exacto
    ])
  ];
}

function visorApplyFilters() {
  const selectedGiro = visorUi.giroFilter.value;
  const selectedTurno = visorUi.turnoFilter.value;
  const selectedMapMode = visorCurrentMapMode();

  return visorState.allData.filter((record) => {
    const statusMatches = selectedMapMode === "historico" || visorPermitStatus(record) === "Vigente";
    const giroMatches = selectedGiro === "todos" || visorRecordRubros(record).some((rubro) => visorColorKey(rubro) === visorColorKey(selectedGiro));
    const turnoMatches = selectedTurno === "todos" || record.turno === selectedTurno;
    return statusMatches && giroMatches && turnoMatches;
  });
}

function visorUpdateStats(filtered) {
  const activeZones = new Set(filtered.map((record) => record.zona).filter(Boolean));
  const historical = visorState.allData.reduce((sum, record) => sum + Math.max((record.authorizationCount || 1) - 1, 0), 0);
  visorUi.totalCount.textContent = String(visorState.allData.length);
  visorUi.visibleCount.textContent = String(filtered.length);
  visorUi.activeZones.textContent = String(activeZones.size);
  if (visorUi.historyCount) visorUi.historyCount.textContent = String(historical);
}

function visorPopulateFilterAndLegend() {
  const giros = [...new Set(visorState.allData.flatMap((record) => visorRecordRubros(record)).filter(Boolean))]
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
  const expiredItem = document.createElement("span");
  expiredItem.className = "legend-item static";
  expiredItem.innerHTML = '<span class="legend-dot expired"></span>Vencidos';
  visorUi.legendGiros.appendChild(expiredItem);

  giros.forEach((giro) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "legend-item";
    item.innerHTML = `<span class="legend-dot" style="background:${visorColorForGiro(giro)}"></span>${visorEscapeHtml(giro)}`;
    item.addEventListener("click", () => {
      visorUi.giroFilter.value = giro;
      visorRefresh(false);
    });
    visorUi.legendGiros.appendChild(item);
  });
}

function visorRefresh(fitView = false) {
  const filtered = visorApplyFilters();
  visorRenderMarkers(filtered, fitView);
  visorUpdateStats(filtered);
}

function visorScheduleRefresh(fitView = false) {
  window.clearTimeout(visorState.refreshTimer);
  visorState.refreshTimer = window.setTimeout(() => visorRefresh(fitView), 80);
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
  }).filter((record) => Number.isFinite(record.lat) && Number.isFinite(record.lng));
}

function visorApplyThemeUi(themeName) {
  visorUi.themeIcon.textContent = themeName === "dark" ? "light_mode" : "dark_mode";
}

function visorSetLeafletTheme(themeName) {
  const config = VISOR_TILE_LAYERS[themeName] || VISOR_TILE_LAYERS.light;
  if (visorState.tileLayer) {
    visorState.map.removeLayer(visorState.tileLayer);
  }

  visorState.tileLayer = L.tileLayer(config.url, {
    ...config.options,
    maxZoom: 20,
    updateWhenIdle: true,
    keepBuffer: visorIsCompactDevice() ? 1 : 2
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

function visorSetMobileFiltersOpen(forceOpen) {
  if (!visorUi.mainFilters || !visorUi.btnFilters) return;

  if (window.innerWidth > 768) {
    visorUi.mainFilters.classList.remove("mobile-collapsed");
    visorUi.btnFilters.setAttribute("aria-expanded", "true");
    return;
  }

  const shouldOpen = typeof forceOpen === "boolean"
    ? forceOpen
    : visorUi.mainFilters.classList.contains("mobile-collapsed");

  visorUi.mainFilters.classList.toggle("mobile-collapsed", !shouldOpen);
  visorUi.btnFilters.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
}

function visorAttachUiEvents() {
  visorUi.giroFilter.addEventListener("change", () => visorRefresh(false));
  visorUi.turnoFilter.addEventListener("change", () => visorRefresh(false));
  visorUi.mapModeInputs.forEach((input) => input.addEventListener("change", () => visorRefresh(true)));
  visorUi.searchInput.addEventListener("input", () => visorScheduleRefresh(false));

  visorUi.btnReset.addEventListener("click", () => {
    visorUi.giroFilter.value = "todos";
    visorUi.turnoFilter.value = "todos";
    const defaultMode = visorUi.mapModeInputs.find((input) => input.value === "vigentes");
    if (defaultMode) defaultMode.checked = true;
    visorUi.searchInput.value = "";
    visorRefresh(true);
  });

  visorUi.btnLoc.addEventListener("click", () => {
    if (!navigator.geolocation) {
      visorToast("Geolocalizacion no disponible.", false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        visorState.map.flyTo([position.coords.latitude, position.coords.longitude], 16, { duration: 0.7, animate: true });
      },
      () => visorToast("No se pudo obtener tu ubicación.", false),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  });

  visorUi.themeToggle.addEventListener("click", () => {
    const next = visorTheme() === "dark" ? "light" : "dark";
    visorSetTheme(next);
  });

  visorUi.btnFilters?.addEventListener("click", () => {
    const opening = visorUi.mainFilters.classList.contains("mobile-collapsed");
    visorSetMobileFiltersOpen(opening);
  });

  visorUi.bottomSearch?.addEventListener("click", () => {
    visorSetAppMode("search");
  });

  visorUi.bottomMap?.addEventListener("click", () => visorSetAppMode("map"));

  visorUi.moduleSearchInput?.addEventListener("input", () => visorRenderSearchResults(visorUi.moduleSearchInput.value));

  document.querySelectorAll(".quick-filters button").forEach((button) => {
    button.addEventListener("click", () => {
      const query = button.getAttribute("data-query") || "";
      visorUi.moduleSearchInput.value = query;
      visorRenderSearchResults(query);
    });
  });

  window.addEventListener("resize", () => {
    visorScheduleRefresh(false);
    if (window.innerWidth > 768) {
      visorSetMobileFiltersOpen(true);
    }
  });
}

function visorCreateMap() {
  visorState.map = L.map("map", {
    zoomControl: true,
    preferCanvas: true,
    zoomAnimation: false,
    fadeAnimation: false,
    markerZoomAnimation: false,
    inertia: false
  }).setView([VISOR_CENTER.lat, VISOR_CENTER.lng], 13, { animate: false });

  visorState.canvasRenderer = L.canvas({ padding: 0.25 });
  visorState.markersLayer = L.layerGroup().addTo(visorState.map);
  visorSetLeafletTheme(visorTheme());
}

async function visorLoadData() {
  visorToast("Cargando datos...");
  const dataset = await window.MapComercioData.loadAmbulantesDataset();
  visorState.allData = dataset.records.filter((record) => Number.isFinite(record.lat) && Number.isFinite(record.lng));
  visorPopulateFilterAndLegend();
  visorRenderSearchResults("");
  visorRefresh(true);
  const sourceLabel = dataset.diagnostics.source === "google_sheets+local_backup"
    ? "Google Sheets + CSV"
    : dataset.diagnostics.source === "google_sheets"
      ? "Google Sheets"
      : dataset.diagnostics.filename;
  visorToast(`Cargado: ${sourceLabel} (${visorState.allData.length} puntos)`);
}

window.initMap = async function initMap() {
  cacheVisorDom();
  const savedTheme = window.localStorage.getItem("prefers-theme-visor-ambulantes") || "light";
  visorSetTheme(savedTheme);
  visorCreateMap();
  visorAttachUiEvents();
  visorSetMobileFiltersOpen(window.innerWidth > 768);

  try {
    await visorLoadData();
  } catch (error) {
    visorToast(error.message || "No se pudo cargar el visor.", false);
  }
};
