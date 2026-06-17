# 🗺️ MapComercio - Visualización de Comercio en Mapa

Aplicación web orientada a la visualización geográfica de negocios y comercio, permitiendo analizar información territorial mediante mapas interactivos.

---

## 📌 Descripción

MapComercio es una herramienta diseñada para representar información de comercio en un entorno visual basado en mapas.

Permite identificar ubicaciones, analizar distribución de negocios y facilitar la toma de decisiones mediante visualización geográfica.

El proyecto combina datos estructurados con interfaces web para generar una experiencia clara e intuitiva.

---

## 🎯 Objetivo del proyecto

Desarrollar una solución que permita:

- visualizar negocios o comercio en un mapa interactivo  
- analizar distribución territorial  
- facilitar la interpretación de datos geográficos  
- apoyar la toma de decisiones basada en ubicación  

---

## ❗ Problema que resuelve

En muchos casos:

- la información de negocios está en Excel o bases de datos  
- no existe una visualización clara de la distribución  
- es difícil identificar patrones o zonas críticas  

MapComercio permite transformar esos datos en información visual útil.

---

## ⚙️ Funcionalidades principales

- 🗺️ Visualización de negocios en mapa  
- 📍 Ubicación geográfica de puntos de interés  
- 📊 Análisis visual de distribución  
- 📂 Lectura de datos desde archivos (CSV / Excel)  
- 🔎 Exploración interactiva de información  
- 🌐 Interfaz web accesible  

---

## 🏗️ Arquitectura del sistema

El sistema sigue una estructura ligera orientada a visualización:

- 📊 Fuente de datos (CSV / Excel)
- 🧠 Procesamiento de datos
- 🌐 Interfaz web (HTML + JS)
- 🗺️ Integración con mapas

---

## 🧠 Tecnologías utilizadas

### 🌐 Frontend
<p>
  <img src="https://img.shields.io/badge/HTML- E34F26?style=for-the-badge&logo=html5&logoColor=white" />
  <img src="https://img.shields.io/badge/CSS-1572B6?style=for-the-badge&logo=css3&logoColor=white" />
  <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" />
</p>

### 🧠 Procesamiento de datos
<p>
  <img src="https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white" />
</p>

### 📊 Datos
<p>
  <img src="https://img.shields.io/badge/CSV-000000?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Excel-217346?style=for-the-badge&logo=microsoft-excel&logoColor=white" />
</p>

### 🗺️ Mapas
<p>
  <img src="https://img.shields.io/badge/Maps-4285F4?style=for-the-badge&logo=googlemaps&logoColor=white" />
</p>

---

## 📂 Estructura del proyecto

```bash
MapComercio/
├── visor_ambulantes.html
├── negocios.html
├── data/
│   ├── archivos.csv
│   ├── archivos.xlsx
├── scripts/
├── styles/
└── README.md
# Actualizacion: Google Sheets e historial

El mapa intenta cargar primero la hoja `Autorizaciones_CA` del Google Sheets de Comercio Ambulatorio mediante la API serverless `api/autorizaciones.js`.

Para produccion en Vercel configura una de estas opciones:

- `GCP_SERVICE_ACCOUNT`: JSON completo de la cuenta de servicio.
- o `GOOGLE_CLIENT_EMAIL` + `GOOGLE_PRIVATE_KEY`.

Variables opcionales:

- `SPREADSHEET_ID_COMERCIO`: por defecto usa `1Sd9f0PTfGvFsOPQhA32hUp2idcdkX_LVYQ-bAX2nYU8`.
- `AUTORIZACIONES_SHEET_NAME`: por defecto usa `Autorizaciones_CA`.

Si Google Sheets no responde o faltan credenciales locales, el mapa usa como respaldo `ambulantes_actualizado.csv` / `ambulantes_actualizado.xlsx`.

La data se agrupa por persona, usando `DNI` cuando exista y nombre normalizado como respaldo. Si una persona tiene varias autorizaciones por renovaciones, el punto del mapa muestra la autorizacion vigente mas reciente y el popup conserva las autorizaciones anteriores como historial.
