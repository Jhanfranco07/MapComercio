const { google } = require("googleapis");

const DEFAULT_SPREADSHEET_ID = "1Sd9f0PTfGvFsOPQhA32hUp2idcdkX_LVYQ-bAX2nYU8";
const DEFAULT_SHEET_NAME = "Zonas_Comercio";
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

function stripWrappingQuotes(value) {
  const text = String(value || "").trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  return text;
}

function normalizePrivateKey(value) {
  let key = stripWrappingQuotes(value).replace(/\\\\n/g, "\n").replace(/\\n/g, "\n").replace(/\r\n/g, "\n").trim();
  const begin = key.indexOf("-----BEGIN PRIVATE KEY-----");
  const endMarker = "-----END PRIVATE KEY-----";
  const end = key.indexOf(endMarker);
  if (begin >= 0 && end >= 0) key = key.slice(begin, end + endMarker.length);
  return key;
}

function parseServiceAccount(value) {
  const clean = stripWrappingQuotes(value);
  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch (error) {
    parsed = JSON.parse(Buffer.from(clean, "base64").toString("utf8"));
  }
  parsed.private_key = normalizePrivateKey(parsed.private_key);
  return parsed;
}

function getCredentials() {
  const raw = process.env.GCP_SERVICE_ACCOUNT || process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.gcp_service_account;
  const base64 = process.env.GCP_SERVICE_ACCOUNT_BASE64 || process.env.GOOGLE_SERVICE_ACCOUNT_BASE64;
  if (raw) return parseServiceAccount(raw);
  if (base64) return parseServiceAccount(Buffer.from(stripWrappingQuotes(base64), "base64").toString("utf8"));
  if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    return { client_email: process.env.GOOGLE_CLIENT_EMAIL, private_key: normalizePrivateKey(process.env.GOOGLE_PRIVATE_KEY) };
  }
  throw new Error("Faltan credenciales de Google.");
}

function rowsToFeatures(values) {
  const [, ...rows] = values || [];
  return rows.flatMap((row) => {
    try {
      const geometry = JSON.parse(row[4] || "null");
      if (!geometry || !["LineString", "Polygon"].includes(geometry.type)) return [];
      return [{
        type: "Feature",
        id: row[0],
        properties: {
          id: row[0],
          tipo: row[1] || "prohibida",
          nombre: row[2] || "Zona de control",
          descripcion: row[3] || "",
          updated_at: row[5] || ""
        },
        geometry
      }];
    } catch (error) {
      return [];
    }
  });
}

async function ensureSheet(sheets, spreadsheetId, sheetName) {
  const metadata = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties.title" });
  const exists = (metadata.data.sheets || []).some((sheet) => sheet.properties?.title === sheetName);
  if (exists) return;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: sheetName } } }] }
  });
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Admin-Token");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    const auth = new google.auth.GoogleAuth({ credentials: getCredentials(), scopes: SCOPES });
    const sheets = google.sheets({ version: "v4", auth });
    const spreadsheetId = process.env.SPREADSHEET_ID_COMERCIO || DEFAULT_SPREADSHEET_ID;
    const sheetName = process.env.ZONAS_SHEET_NAME || DEFAULT_SHEET_NAME;

    if (req.method === "GET") {
      try {
        const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${sheetName}'!A:F` });
        return res.status(200).json({ ok: true, sheetName, features: rowsToFeatures(response.data.values || []) });
      } catch (error) {
        if (error.code === 400 || error.code === 404) return res.status(200).json({ ok: true, sheetName, features: [] });
        throw error;
      }
    }

    if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Metodo no permitido" });
    const expectedToken = process.env.ZONAS_ADMIN_TOKEN;
    if (!expectedToken) return res.status(503).json({ ok: false, error: "Falta configurar ZONAS_ADMIN_TOKEN en Vercel." });
    if (req.headers["x-admin-token"] !== expectedToken) return res.status(401).json({ ok: false, error: "Clave de edicion incorrecta." });

    const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const features = Array.isArray(payload.features) ? payload.features.slice(0, 300) : [];
    const valid = features.filter((feature) => ["LineString", "Polygon"].includes(feature?.geometry?.type));
    await ensureSheet(sheets, spreadsheetId, sheetName);
    const rows = [["id", "tipo", "nombre", "descripcion", "geojson", "updated_at"], ...valid.map((feature, index) => {
      const properties = feature.properties || {};
      return [
        properties.id || feature.id || `zona-${index + 1}`,
        properties.tipo || "prohibida",
        properties.nombre || "Zona de control",
        properties.descripcion || "",
        JSON.stringify(feature.geometry),
        new Date().toISOString()
      ];
    })];
    await sheets.spreadsheets.values.clear({ spreadsheetId, range: `'${sheetName}'!A:F` });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${sheetName}'!A1`,
      valueInputOption: "RAW",
      requestBody: { values: rows }
    });
    return res.status(200).json({ ok: true, saved: valid.length, sheetName });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.response?.data?.error?.message || error.message || "No se pudieron procesar las zonas." });
  }
};
