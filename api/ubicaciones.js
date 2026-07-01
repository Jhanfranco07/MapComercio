const { google } = require("googleapis");

const DEFAULT_SPREADSHEET_ID = "1Sd9f0PTfGvFsOPQhA32hUp2idcdkX_LVYQ-bAX2nYU8";
const DEFAULT_SHEET_NAME = "Autorizaciones_CA";
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

function stripWrappingQuotes(value) {
  const text = String(value || "").trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) return text.slice(1, -1);
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

function normalizeHeader(value) {
  return String(value || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function columnLetter(index) {
  let number = index + 1;
  let result = "";
  while (number > 0) {
    number -= 1;
    result = String.fromCharCode(65 + (number % 26)) + result;
    number = Math.floor(number / 26);
  }
  return result;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Admin-Token");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Metodo no permitido" });

  try {
    const expectedToken = process.env.ZONAS_ADMIN_TOKEN;
    if (!expectedToken) return res.status(503).json({ ok: false, error: "Falta configurar ZONAS_ADMIN_TOKEN en Vercel." });
    if (req.headers["x-admin-token"] !== expectedToken) return res.status(401).json({ ok: false, error: "Clave de edicion incorrecta." });

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const sourceRow = Number(body.sourceRow);
    const clear = Boolean(body.clear);
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (!Number.isInteger(sourceRow) || sourceRow < 2) return res.status(400).json({ ok: false, error: "Fila de Google Sheets invalida." });
    if (!clear && (!Number.isFinite(lat) || !Number.isFinite(lng))) return res.status(400).json({ ok: false, error: "Coordenadas invalidas." });

    const auth = new google.auth.GoogleAuth({ credentials: getCredentials(), scopes: SCOPES });
    const sheets = google.sheets({ version: "v4", auth });
    const spreadsheetId = process.env.SPREADSHEET_ID_COMERCIO || DEFAULT_SPREADSHEET_ID;
    const sheetName = process.env.AUTORIZACIONES_SHEET_NAME || DEFAULT_SHEET_NAME;
    const headerResponse = await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${sheetName}'!1:1` });
    const headers = headerResponse.data.values?.[0] || [];
    const coordinateIndex = headers.findIndex((header) => normalizeHeader(header) === "COORDENADAS");
    if (coordinateIndex < 0) return res.status(500).json({ ok: false, error: "No se encontro la columna COORDENADAS." });

    const value = clear ? "" : `${lat.toFixed(7)}, ${lng.toFixed(7)}`;
    const cell = `${columnLetter(coordinateIndex)}${sourceRow}`;
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${sheetName}'!${cell}`,
      valueInputOption: "RAW",
      requestBody: { values: [[value]] }
    });
    return res.status(200).json({ ok: true, sourceRow, cell, coordinates: value });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.response?.data?.error?.message || error.message || "No se pudo actualizar la ubicacion." });
  }
};
