const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "public");

const files = [
  "index.html",
  "visor_ambulantes.html",
  "negocios.html",
  "styles.css",
  "data-source.js",
  "script.js",
  "visor.js",
  "script.ts",
  "visor.ts",
  "ambulantes_actualizado.csv",
  "ambulantes_actualizado.xlsx",
  "negocios66.xlsx",
  "mapa1.svg",
  "peruHigh.svg"
];

fs.mkdirSync(output, { recursive: true });

files.forEach((file) => {
  const source = path.join(root, file);
  if (!fs.existsSync(source)) return;
  fs.copyFileSync(source, path.join(output, file));
});

console.log(`Archivos estaticos copiados a ${output}`);
