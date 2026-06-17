const MAPCOMERCIO_LOCAL_CANDIDATES = [
  "ambulantes_actualizado.csv",
  "ambulantes_actualizado.xlsx",
  "ambulantes.xlsx",
  "ambulantes.csv"
];

const MAPCOMERCIO_REQUIRED_SHEET_COLUMNS = [
  "NOMBRE Y APELLIDO",
  "DNI",
  "N° DE CERTIFICADO",
  "VIGENCIA DE AUTORIZACIÓN",
  "LUGAR DE VENTA",
  "COORDENADAS",
  "GIRO",
  "HORARIO"
];

const MAPCOMERCIO_RUBROS = [
  { label: "ASEDIPA", patterns: ["ASEDIPA"] },
  { label: "GOLOSINAS Y AFINES", patterns: ["GOLOSINAS", "AFINES"] },
  { label: "VENTA DE FRUTAS O VERDURAS", patterns: ["FRUTAS O VERDURAS", "VENTA DE FRUTAS", "VERDURAS"] },
  { label: "PRODUCTOS NATURALES", patterns: ["PRODUCTOS NATURALES"] },
  { label: "BEBIDAS SALUDABLES", patterns: ["BEBIDAS SALUDABLES", "EMOLIENTE", "QUINUA", "MACA", "SOYA"] },
  { label: "POTAJES TRADICIONALES", patterns: ["POTAJES TRADICIONALES"] },
  { label: "DULCES TRADICIONALES", patterns: ["DULCES TRADICIONALES"] },
  { label: "SÁNDWICHES", patterns: ["SANDWICH", "SANDWICHES", "SÁNDWICH", "SÁNDWICHES"] },
  { label: "JUGO DE NARANJA Y SIMILARES", patterns: ["JUGO DE NARANJA"] },
  { label: "CANCHITAS, CONFITERÍA Y SIMILARES", patterns: ["CANCHITAS", "CONFITERIA", "CONFITERÍA"] },
  { label: "MERCERÍAS, BAZAR Y ÚTILES DE ESCRITORIO", patterns: ["MERCERIA", "MERCERÍAS", "BAZAR", "UTILES DE ESCRITORIO", "ÚTILES DE ESCRITORIO"] },
  { label: "DIARIOS, REVISTAS, LIBROS Y LOTERÍAS", patterns: ["DIARIOS", "REVISTAS", "LIBROS", "LOTERIAS", "LOTERÍAS"] },
  { label: "MONEDAS Y ESTAMPILLAS", patterns: ["MONEDAS", "ESTAMPILLAS"] },
  { label: "ARTESANÍAS", patterns: ["ARTESANIAS", "ARTESANÍAS"] },
  { label: "ARTÍCULOS RELIGIOSOS", patterns: ["ARTICULOS RELIGIOSOS", "ARTÍCULOS RELIGIOSOS"] },
  { label: "ARTÍCULOS DE LIMPIEZA", patterns: ["ARTICULOS DE LIMPIEZA", "ARTÍCULOS DE LIMPIEZA"] },
  { label: "PILAS Y RELOJES", patterns: ["PILAS", "RELOJES"] },
  { label: "DUPLICADO DE LLAVES / CERRAJERÍA", patterns: ["DUPLICADO DE LLAVES", "CERRAJERIA", "CERRAJERÍA"] },
  { label: "LUSTRADORES DE CALZADO", patterns: ["LUSTRADORES", "LUSTRADOR DE CALZADO"] },
  { label: "ARTISTAS PLÁSTICOS Y RETRATISTAS", patterns: ["ARTISTAS PLASTICOS", "ARTISTAS PLÁSTICOS", "RETRATISTAS"] },
  { label: "FOTOGRAFÍAS", patterns: ["FOTOGRAFIAS", "FOTOGRAFÍAS"] }
];

function mcNormalizeKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[áàäâã]/g, "a")
    .replace(/[éèëê]/g, "e")
    .replace(/[íìïî]/g, "i")
    .replace(/[óòöôõ]/g, "o")
    .replace(/[úùüû]/g, "u")
    .replace(/ñ/g, "n")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[°º]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/autorizaci_n/g, "autorizacion")
    .replace(/evaluaci_n/g, "evaluacion")
    .replace(/resoluci_n/g, "resolucion")
    .replace(/ubicaci_n/g, "ubicacion")
    .replace(/^_+|_+$/g, "");
}

function mcNormalizeText(value) {
  return String(value || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function mcStandardRubros(giro, productos = "") {
  const normalized = mcNormalizeText(`${giro} ${productos}`);
  if (!normalized) return [];

  if (normalized.includes("ASEDIPA")) return ["ASEDIPA"];
  if (
    normalized.includes("VENTA DE EMOLIENTE") &&
    normalized.includes("QUINUA") &&
    normalized.includes("KIWICHA") &&
    normalized.includes("DERIVADOS") &&
    normalized.includes("PANES")
  ) {
    return ["ASEDIPA"];
  }

  const rubros = [];
  MAPCOMERCIO_RUBROS.forEach((rubro) => {
    if (rubro.label === "ASEDIPA") return;
    const matched = rubro.patterns.some((pattern) => normalized.includes(mcNormalizeText(pattern)));
    if (matched && !rubros.includes(rubro.label)) rubros.push(rubro.label);
  });

  return rubros.length ? rubros : [String(giro || "SIN RUBRO").trim()];
}

function mcGet(row, aliases) {
  const normalized = {};
  Object.keys(row || {}).forEach((key) => {
    normalized[mcNormalizeKey(key)] = row[key];
  });

  for (const alias of aliases) {
    const value = normalized[mcNormalizeKey(alias)];
    if (value !== undefined && String(value).trim() !== "") return value;
  }
  return "";
}

function mcParseCoords(value) {
  if (!value) return { lat: null, lng: null };
  const match = String(value).match(/(-?\d+(?:\.\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return { lat: null, lng: null };

  const lat = Number.parseFloat(match[1]);
  const lng = Number.parseFloat(match[2]);
  return {
    lat: Number.isFinite(lat) && lat >= -90 && lat <= 90 ? lat : null,
    lng: Number.isFinite(lng) && lng >= -180 && lng <= 180 ? lng : null
  };
}

function mcNormalizeTurno(value) {
  const normalized = String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (normalized.includes("tarde")) return "tarde";
  if (normalized.includes("manana")) return "manana";
  return "";
}

function mcInferTurno(horario) {
  const upper = String(horario || "").toUpperCase();
  if (upper.includes("PM") || upper.includes("TARDE")) {
    return "tarde";
  }

  const hourMatch = upper.match(/\b(\d{1,2})(?::|\s*H|\s*A|\s*-)/);
  if (hourMatch) {
    const hour = Number(hourMatch[1]);
    if (Number.isFinite(hour) && hour >= 12) return "tarde";
  }

  if (/\b(12|13|14|15|16|17|18|19|20|21|22|23):/.test(upper)) {
    return "tarde";
  }

  return "manana";
}

function mcParseDate(value) {
  const text = String(value || "");
  const match = text.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]) - 1;
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

function mcVigenciaEnd(value) {
  const dates = String(value || "").match(/\d{1,2}[/-]\d{1,2}[/-]\d{4}/g) || [];
  const last = dates.length ? dates[dates.length - 1] : "";
  return mcParseDate(last);
}

function mcVigenciaStart(value) {
  const dates = String(value || "").match(/\d{1,2}[/-]\d{1,2}[/-]\d{4}/g) || [];
  return mcParseDate(dates[0] || "");
}

function mcYearFromDate(date) {
  return date && !Number.isNaN(date.getTime()) ? date.getUTCFullYear() : 0;
}

function mcAuthorizationYear(vigencia, fallbackValues = []) {
  const startYear = mcYearFromDate(mcVigenciaStart(vigencia));
  if (startYear) return startYear;
  const years = mcYearsFromText(...fallbackValues);
  return years.find((year) => year === 2026 || year === 2025) || years[0] || 0;
}

function mcFormatAuthorizationNumber(value, year) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/\d{1,2}:\d{2}/.test(raw)) return "";

  const cleaned = raw
    .replace(/^N\s*[Â°º°]?\s*/i, "")
    .replace(/^NRO\.?\s*/i, "")
    .replace(/^NUM(?:ERO)?\.?\s*/i, "")
    .trim();

  const withoutDuplicatedPrefix = cleaned.replace(/^N\s*[Â°º°]?\s*/i, "").trim();
  const hasYear = /\b20\d{2}\b/.test(withoutDuplicatedPrefix);
  const suffix = year && !hasYear ? ` - ${year}` : "";
  return `N\u00b0 ${withoutDuplicatedPrefix}${suffix}`.replace(/\s+/g, " ").trim();
}

function mcCertNumber(value) {
  const match = String(value || "").match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function mcYearsFromText(...values) {
  const years = [];
  values.forEach((value) => {
    const matches = String(value || "").match(/\b(20\d{2}|19\d{2})\b/g) || [];
    matches.forEach((year) => years.push(Number(year)));
  });
  return years;
}

function mcRecordYears(record) {
  return mcYearsFromText(
    record.licencia,
    record.vigencia,
    mcGet(record.raw, [
      "FECHA DE INGRESO",
      "FECHA EMITIDA CERTIFICADO",
      "FECHA RESOLUCIÓN",
      "FECHA RESOLUCION",
      "FECHA DE EVALUACION",
      "PERIODO"
    ])
  );
}

function mcIsRecordFromYear(record, year) {
  return mcRecordYears(record).includes(year);
}

function mcZoneFromLocation(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const separators = [" - ", ",", ";", " FRONTIS ", " ALTURA "];
  for (const separator of separators) {
    const index = text.toUpperCase().indexOf(separator);
    if (index > 8) return text.slice(0, index).trim();
  }
  return text.length > 54 ? `${text.slice(0, 54).trim()}...` : text;
}

function mcIsSheetRow(row) {
  const keys = Object.keys(row || {}).map(mcNormalizeKey);
  return keys.includes("coordenadas") || keys.includes("nombre_y_apellido") || keys.includes("dni");
}

function mcNormalizeSheetRow(row, index) {
  const coords = mcParseCoords(mcGet(row, ["COORDENADAS", "UBICACION", "UBICACIÓN"]));
  const lugarVenta = String(mcGet(row, ["LUGAR DE VENTA", "UBICACION A SOLICITAR", "UBICACIÓN A SOLICITAR"])).trim();
  const referencia = String(mcGet(row, ["REFERENCIA", "ZONA", "SECTOR"])).trim();
  const horario = String(mcGet(row, ["HORARIO"])).trim();
  const certificado = String(mcGet(row, ["N° DE CERTIFICADO", "N DE CERTIFICADO", "CERTIFICADO"])).trim();
  const dni = String(mcGet(row, ["DNI", "D.N.I.", "DNI/CE"])).trim();
  const nombre = String(mcGet(row, ["NOMBRE Y APELLIDO", "NOMBRES Y APELLIDOS", "APELLIDOS Y NOMBRES"])).trim();
  const vigencia = String(mcGet(row, ["VIGENCIA DE AUTORIZACIÓN", "VIGENCIA DE AUTORIZACION", "VIGENCIA"])).trim();
  const giro = String(mcGet(row, ["GIRO", "GIRO O MOTIVO DE LA SOLICITUD"])).trim();
  const detalle = String(mcGet(row, ["DETALLE DE VENTA", "PRODUCTOS"])).trim();
  const rowNumber = Number(row._sheetRow || index + 2);
  const licenciaNormalizada = mcFormatAuthorizationNumber(
    certificado,
    mcAuthorizationYear(vigencia, [
      certificado,
      mcGet(row, ["FECHA EMITIDA CERTIFICADO", "FECHA RESOLUCIÃ“N", "FECHA RESOLUCION", "FECHA DE INGRESO"])
    ])
  );

  return {
    source: "google_sheets",
    sourceRow: rowNumber,
    id: `sheet-${rowNumber}`,
    personKey: dni ? `dni:${dni}` : `name:${mcNormalizeText(nombre) || rowNumber}`,
    nombre,
    dni,
    giro,
    rubros: mcStandardRubros(giro, detalle),
    productos: detalle || giro,
    detalleVentaOriginal: detalle,
    zona: referencia || mcZoneFromLocation(lugarVenta),
    lugar_exacto: lugarVenta,
    horario,
    licencia: certificado ? `N° ${certificado}`.replace(/^N°\s*N°/i, "N°") : "",
    vigencia,
    licencia: licenciaNormalizada,
    turno: mcNormalizeTurno(horario) || mcInferTurno(horario),
    lat: coords.lat,
    lng: coords.lng,
    sortDate: mcVigenciaEnd(vigencia) || mcParseDate(mcGet(row, ["FECHA EMITIDA CERTIFICADO", "FECHA RESOLUCIÓN", "FECHA RESOLUCION"])) || new Date(0),
    sortNumber: mcCertNumber(certificado),
    raw: row
  };
}

function mcNormalizeLocalRow(row, index) {
  const coords = mcParseCoords(mcGet(row, ["ubicacion", "ubicación"]));
  const latRaw = Number.parseFloat(mcGet(row, ["lat", "Lat"]));
  const lngRaw = Number.parseFloat(mcGet(row, ["lng", "long", "Lng", "Long"]));
  const horario = String(mcGet(row, ["horario"])).trim();
  const nombre = String(mcGet(row, ["nombre"])).trim();
  const licencia = String(mcGet(row, ["licencia"])).trim();
  const vigenciaLocal = String(mcGet(row, ["vigencia"])).trim();
  const licenciaNormalizada = mcFormatAuthorizationNumber(
    licencia,
    mcAuthorizationYear(vigenciaLocal, [licencia])
  );

  return {
    source: "local_backup",
    sourceRow: index + 2,
    id: String(mcGet(row, ["id"]) || `local-${index + 1}`),
    personKey: `name:${mcNormalizeText(nombre) || index + 1}`,
    nombre,
    dni: "",
    giro: String(mcGet(row, ["giro"])).trim(),
    rubros: mcStandardRubros(String(mcGet(row, ["giro"])).trim(), String(mcGet(row, ["productos"])).trim()),
    productos: String(mcGet(row, ["productos"])).trim(),
    detalleVentaOriginal: String(mcGet(row, ["productos"])).trim(),
    zona: String(mcGet(row, ["zona"])).trim(),
    lugar_exacto: String(mcGet(row, ["lugar_exacto", "lugar"])).trim(),
    horario,
    licencia,
    vigencia: String(mcGet(row, ["vigencia"])).trim(),
    licencia: licenciaNormalizada,
    vigencia: vigenciaLocal,
    turno: mcNormalizeTurno(mcGet(row, ["turno"])) || mcInferTurno(horario),
    lat: Number.isFinite(latRaw) ? latRaw : coords.lat,
    lng: Number.isFinite(lngRaw) ? lngRaw : coords.lng,
    sortDate: mcVigenciaEnd(mcGet(row, ["vigencia"])) || new Date(0),
    sortNumber: mcCertNumber(licencia),
    raw: row
  };
}

function mcGroupAuthorizations(records) {
  const nameToDniKey = new Map();

  records.forEach((record) => {
    const nameKey = mcNormalizeText(record.nombre);
    if (record.dni && nameKey) {
      nameToDniKey.set(nameKey, `dni:${record.dni}`);
    }
  });

  const uniqueRecords = [];
  const seen = new Set();

  records.forEach((record) => {
    const hasDocumentIdentity = record.licencia || record.vigencia;
    const dedupeKey = hasDocumentIdentity
      ? [
          mcNormalizeText(record.nombre),
          mcNormalizeText(record.licencia),
          mcNormalizeText(record.vigencia)
        ].join("|")
      : [
          mcNormalizeText(record.nombre),
          mcNormalizeText(record.lugar_exacto),
          Number.isFinite(record.lat) ? record.lat.toFixed(6) : "",
          Number.isFinite(record.lng) ? record.lng.toFixed(6) : ""
        ].join("|");

    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    uniqueRecords.push(record);
  });

  const groups = new Map();

  uniqueRecords.forEach((record) => {
    const nameKey = mcNormalizeText(record.nombre);
    const key = record.dni
      ? `dni:${record.dni}`
      : nameToDniKey.get(nameKey) || record.personKey || record.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  });

  return Array.from(groups.values()).map((items, groupIndex) => {
    const sorted = items.sort((a, b) => {
      const dateDiff = b.sortDate.getTime() - a.sortDate.getTime();
      if (dateDiff) return dateDiff;
      const numberDiff = b.sortNumber - a.sortNumber;
      if (numberDiff) return numberDiff;
      return b.sourceRow - a.sourceRow;
    });

    const current = sorted[0];
    return {
      ...current,
      id: current.dni ? `dni-${current.dni}` : `persona-${groupIndex + 1}-${mcNormalizeKey(current.nombre)}`,
      autorizacion_actual: current,
      historial: sorted.slice(1),
      autorizaciones: sorted,
      authorizationCount: sorted.length
    };
  });
}

function mcBuildCsvDetailIndex(localRecords) {
  const index = new Map();

  localRecords.forEach((record) => {
    const nameKey = mcNormalizeText(record.nombre);
    if (!nameKey || !record.productos) return;
    if (!index.has(nameKey)) index.set(nameKey, []);
    index.get(nameKey).push(record);
  });

  index.forEach((items) => {
    items.sort((a, b) => {
      const dateDiff = b.sortDate.getTime() - a.sortDate.getTime();
      if (dateDiff) return dateDiff;
      return b.sourceRow - a.sourceRow;
    });
  });

  return index;
}

function mcEnrichSheetDetailsFromCsv(sheetRecords, localRecords) {
  const detailIndex = mcBuildCsvDetailIndex(localRecords);

  return sheetRecords.map((record) => {
    if (String(record.detalleVentaOriginal || "").trim()) return record;

    const nameKey = mcNormalizeText(record.nombre);
    const candidates = detailIndex.get(nameKey) || [];
    if (!candidates.length) return record;

    const giroKey = mcNormalizeText(record.giro);
    const best =
      candidates.find((candidate) => giroKey && mcNormalizeText(candidate.giro) === giroKey) ||
      candidates.find((candidate) => giroKey && giroKey.includes(mcNormalizeText(candidate.giro))) ||
      candidates.find((candidate) => giroKey && mcNormalizeText(candidate.giro).includes(giroKey)) ||
      candidates[0];

    return {
      ...record,
      productos: best.productos,
      rubros: mcStandardRubros(record.giro, best.productos),
      detalleVentaFromCsv: true,
      detalleVentaSource: {
        sourceRow: best.sourceRow,
        licencia: best.licencia,
        vigencia: best.vigencia
      }
    };
  });
}

function mcDiagnostics(records, grouped, sourceInfo, rawRows) {
  const missingCoords = grouped.filter((record) => !Number.isFinite(record.lat) || !Number.isFinite(record.lng));
  const repeatedPeople = grouped.filter((record) => record.authorizationCount > 1);
  const invalidCoordinateRows = records
    .filter((record) => !Number.isFinite(record.lat) || !Number.isFinite(record.lng))
    .slice(0, 25)
    .map((record) => ({
      fila: record.sourceRow,
      nombre: record.nombre,
      certificado: record.licencia,
      coordenadas: mcGet(record.raw, ["COORDENADAS", "ubicacion", "ubicación"])
    }));

  const headers = rawRows.length ? Object.keys(rawRows[0]) : [];
  const normalizedHeaders = new Set(headers.map(mcNormalizeKey));
  const missingRequiredColumns = MAPCOMERCIO_REQUIRED_SHEET_COLUMNS.filter(
    (column) => !normalizedHeaders.has(mcNormalizeKey(column))
  );

  return {
    source: sourceInfo.source,
    filename: sourceInfo.filename || "",
    fetchedAt: sourceInfo.fetchedAt || "",
    rawRows: rawRows.length,
    normalizedRows: records.length,
    people: grouped.length,
    currentWithCoordinates: grouped.length - missingCoords.length,
    withoutCoordinates: missingCoords.length,
    repeatedPeople: repeatedPeople.length,
    historicalAuthorizations: records.length - grouped.length,
    missingRequiredColumns: sourceInfo.source === "google_sheets" ? missingRequiredColumns : [],
    invalidCoordinateRows
  };
}

async function mcLoadFromUrl(fileName) {
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

async function mcLoadLocalDataset() {
  const errors = [];
  for (const fileName of MAPCOMERCIO_LOCAL_CANDIDATES) {
    try {
      const rows = await mcLoadFromUrl(fileName);
      return { rows, sourceInfo: { source: "local_backup", filename: fileName } };
    } catch (error) {
      errors.push(`${fileName}: ${error.message}`);
    }
  }
  throw new Error(`No se encontro dataset local. ${errors.join(" | ")}`);
}

async function mcLoadSheetsDataset() {
  const response = await fetch("/api/autorizaciones");
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || `No se pudo leer Google Sheets (HTTP ${response.status})`);
  }
  return {
    rows: payload.rows || [],
    sourceInfo: {
      source: "google_sheets",
      fetchedAt: payload.fetchedAt,
      sheetName: payload.sheetName
    }
  };
}

async function mcLoadAmbulantesDataset() {
  const datasets = [];
  const errors = [];

  try {
    datasets.push(await mcLoadSheetsDataset());
  } catch (error) {
    errors.push(`Google Sheets: ${error.message}`);
  }

  try {
    datasets.push(await mcLoadLocalDataset());
  } catch (error) {
    errors.push(`CSV/XLSX local: ${error.message}`);
  }

  if (!datasets.length) {
    throw new Error(`No se pudo cargar Google Sheets ni respaldo local. ${errors.join(" | ")}`);
  }

  const rows = datasets.flatMap((dataset) => dataset.rows || []);
  const sheetRecordsRaw = datasets
    .filter((dataset) => dataset.sourceInfo.source === "google_sheets")
    .flatMap((dataset) => (dataset.rows || []).map((row, index) => mcNormalizeSheetRow(row, index)));
  const localRecordsRaw = datasets
    .filter((dataset) => dataset.sourceInfo.source === "local_backup")
    .flatMap((dataset) => (dataset.rows || []).map((row, index) => mcNormalizeLocalRow(row, index)));

  const localRecords2025 = localRecordsRaw;
  const sheetRecords2026 = sheetRecordsRaw.filter((record) => mcIsRecordFromYear(record, 2026));
  const sheetRecords2026Enriched = mcEnrichSheetDetailsFromCsv(sheetRecords2026, localRecords2025);
  const records = [...sheetRecords2026Enriched, ...localRecords2025];
  const grouped = mcGroupAuthorizations(records);
  const sourceInfo = {
    source: datasets.length > 1 ? "google_sheets+local_backup" : datasets[0].sourceInfo.source,
    filename: datasets.map((dataset) => dataset.sourceInfo.filename).filter(Boolean).join(" + "),
    fetchedAt: datasets.map((dataset) => dataset.sourceInfo.fetchedAt).filter(Boolean).join(" + "),
    parts: datasets.map((dataset) => dataset.sourceInfo)
  };
  const diagnostics = mcDiagnostics(records, grouped, sourceInfo, rows);
  diagnostics.sourceRules = {
    googleSheetsYear: 2026,
    localBackupYear: 2025,
    googleSheetsRowsBeforeFilter: sheetRecordsRaw.length,
    googleSheetsRowsAfterFilter: sheetRecords2026.length,
    localRowsBeforeFilter: localRecordsRaw.length,
    localRowsAfterFilter: localRecords2025.length,
    detailsFilledFromCsv: sheetRecords2026Enriched.filter((record) => record.detalleVentaFromCsv).length
  };

  if (errors.length) diagnostics.partialLoadErrors = errors;

  return {
    records: grouped,
    rawAuthorizations: records,
    diagnostics,
    sourceInfo
  };
}

window.MapComercioData = {
  loadAmbulantesDataset: mcLoadAmbulantesDataset
};
