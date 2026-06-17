const { google } = require("googleapis");

const DEFAULT_SPREADSHEET_ID = "1Sd9f0PTfGvFsOPQhA32hUp2idcdkX_LVYQ-bAX2nYU8";
const DEFAULT_SHEET_NAME = "Autorizaciones_CA";
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"];

function stripWrappingQuotes(value) {
  const text = String(value || "").trim();
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    return text.slice(1, -1);
  }
  return text;
}

function normalizePrivateKey(value) {
  let key = stripWrappingQuotes(value)
    .replace(/\\\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n")
    .trim();

  if (!key) return key;

  if (key.includes("-----BEGIN PRIVATE KEY-----") && !key.includes("\n")) {
    key = key
      .replace("-----BEGIN PRIVATE KEY-----", "-----BEGIN PRIVATE KEY-----\n")
      .replace("-----END PRIVATE KEY-----", "\n-----END PRIVATE KEY-----");
  }

  return key;
}

function getServiceAccount() {
  const rawJson =
    process.env.GCP_SERVICE_ACCOUNT ||
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
    process.env.gcp_service_account;

  if (rawJson) {
    const parsed = JSON.parse(stripWrappingQuotes(rawJson));
    if (parsed.private_key) {
      parsed.private_key = normalizePrivateKey(parsed.private_key);
    }
    return parsed;
  }

  if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    return {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: normalizePrivateKey(process.env.GOOGLE_PRIVATE_KEY)
    };
  }

  throw new Error(
    "Faltan credenciales. Configura GCP_SERVICE_ACCOUNT o GOOGLE_CLIENT_EMAIL + GOOGLE_PRIVATE_KEY."
  );
}

function rowsFromValues(values) {
  const [header = [], ...body] = values || [];
  const headers = header.map((cell) => String(cell || "").trim());

  return body
    .filter((row) => row.some((cell) => String(cell || "").trim()))
    .map((row, rowIndex) => {
      const record = { _sheetRow: rowIndex + 2 };
      headers.forEach((name, index) => {
        if (name) record[name] = row[index] ?? "";
      });
      return record;
    });
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "Metodo no permitido" });
    return;
  }

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: getServiceAccount(),
      scopes: SCOPES
    });
    const sheets = google.sheets({ version: "v4", auth });
    const spreadsheetId = process.env.SPREADSHEET_ID_COMERCIO || DEFAULT_SPREADSHEET_ID;
    const sheetName = process.env.AUTORIZACIONES_SHEET_NAME || DEFAULT_SHEET_NAME;

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${sheetName}'!A:Z`,
      valueRenderOption: "FORMATTED_VALUE"
    });

    const rows = rowsFromValues(response.data.values || []);
    res.status(200).json({
      ok: true,
      source: "google_sheets",
      spreadsheetId,
      sheetName,
      fetchedAt: new Date().toISOString(),
      rows
    });
  } catch (error) {
    const status = error.code || error.response?.status || 500;
    const details = error.response?.data?.error?.message || error.message || "No se pudo leer Google Sheets";
    const isPrivateKeyError = /DECODER routines|unsupported|private key|PEM/i.test(details);
    res.status(500).json({
      ok: false,
      source: "google_sheets",
      error: isPrivateKeyError
        ? "La clave privada de Google no tiene un formato valido en Vercel. Vuelve a pegar GCP_SERVICE_ACCOUNT como JSON en una sola linea o usa GOOGLE_CLIENT_EMAIL + GOOGLE_PRIVATE_KEY."
        : status === 404
          ? "Google Sheets no encontro la hoja. Verifica SPREADSHEET_ID_COMERCIO, AUTORIZACIONES_SHEET_NAME y que el Sheet este compartido con la cuenta de servicio."
          : details,
      status
    });
  }
};
