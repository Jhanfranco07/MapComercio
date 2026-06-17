const { google } = require("googleapis");

const DEFAULT_SPREADSHEET_ID = "1Sd9f0PTfGvFsOPQhA32hUp2idcdkX_LVYQ-bAX2nYU8";
const DEFAULT_SHEET_NAME = "Autorizaciones_CA";
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"];

function getServiceAccount() {
  const rawJson =
    process.env.GCP_SERVICE_ACCOUNT ||
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
    process.env.gcp_service_account;

  if (rawJson) {
    const parsed = JSON.parse(rawJson);
    if (parsed.private_key) {
      parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
    }
    return parsed;
  }

  if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    return {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n")
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
    res.status(500).json({
      ok: false,
      source: "google_sheets",
      error: error.message || "No se pudo leer Google Sheets"
    });
  }
};
