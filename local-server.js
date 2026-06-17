const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { URL } = require("node:url");

const apiAutorizaciones = require("./api/autorizaciones");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
};

function loadEnvLocal() {
  const envPath = path.join(ROOT, ".env.local");
  if (!fs.existsSync(envPath)) return;

  const text = fs.readFileSync(envPath, "utf8");
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;

    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }

  if (!process.env.GCP_SERVICE_ACCOUNT && text.includes("[gcp_service_account]")) {
    const account = {};
    let inSection = false;
    let multilineKey = "";
    let multilineValue = [];

    for (const rawLine of lines) {
      const trimmed = rawLine.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      if (multilineKey) {
        if (trimmed.endsWith('"""')) {
          multilineValue.push(trimmed.slice(0, -3));
          account[multilineKey] = multilineValue.join("\n");
          multilineKey = "";
          multilineValue = [];
        } else {
          multilineValue.push(rawLine);
        }
        continue;
      }

      if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        inSection = trimmed === "[gcp_service_account]";
        continue;
      }
      if (!inSection) continue;

      const index = trimmed.indexOf("=");
      if (index === -1) continue;

      const key = trimmed.slice(0, index).trim();
      let value = trimmed.slice(index + 1).trim();

      if (value.startsWith('"""')) {
        value = value.slice(3);
        if (value.endsWith('"""')) {
          account[key] = value.slice(0, -3);
        } else {
          multilineKey = key;
          multilineValue = [value];
        }
        continue;
      }

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      account[key] = value;
    }

    process.env.GCP_SERVICE_ACCOUNT = JSON.stringify(account);
  }
}

function send(res, status, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, { "Content-Type": contentType });
  res.end(body);
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requestPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.resolve(ROOT, `.${requestPath}`);

  if (!filePath.startsWith(ROOT)) {
    send(res, 403, "Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      send(res, 404, "Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    send(res, 200, data, MIME_TYPES[ext] || "application/octet-stream");
  });
}

loadEnvLocal();

const server = http.createServer(async (req, res) => {
  if (req.url.startsWith("/api/autorizaciones")) {
    await apiAutorizaciones(req, {
      setHeader: (...args) => res.setHeader(...args),
      status(code) {
        res.statusCode = code;
        return {
          json(payload) {
            send(res, code, JSON.stringify(payload), "application/json; charset=utf-8");
          },
          end() {
            res.writeHead(code);
            res.end();
          }
        };
      }
    });
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`MapComercio local: http://localhost:${PORT}`);
});
