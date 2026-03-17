    /* ==================== Config ==================== */
    const DATA_CANDIDATES = [
      "ambulantes_actualizado.xlsx","ambulantes_actualizado.csv",
      "ambulantes.xlsx","ambulantes.csv"
    ];
    const MAP_ID_LIGHT = "REEMPLAZA_CON_TU_MAP_ID_CLARO";
    const MAP_ID_DARK  = "REEMPLAZA_CON_TU_MAP_ID_OSCURO";
    const PACHACAMAC_CENTER = { lat: -12.155, lng: -76.870 };

    /* ==================== Estado ==================== */
    let map, infoWindow, markers=[];
    let allData=[];

    /* ==================== Utils ==================== */
    const normalizeKey = s => String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,'_');
    const esc = t => String(t??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const theme = () => document.documentElement.getAttribute('data-theme') || 'light';

    function toast(msg, ok=true){
      const el = document.getElementById('toast');
      el.textContent = msg;
      el.style.background = ok ? '#0ea5e9' : '#ef4444';
      el.classList.add('show');
      setTimeout(()=>el.classList.remove('show'), 2300);
    }

    // Ajusta la variable CSS --export-h según la barra real
    function adjustFabOffset(){
      const bar = document.getElementById('exportBar');
      const h = (bar?.offsetHeight || 64);
      document.documentElement.style.setProperty('--export-h', h + 'px');
    }

    function parseUbicacion(val){
      if(!val) return {lat:null,lng:null};
      const txt=String(val).replace(/\s+/g,''); const [la,ln]=txt.split(',');
      const lat=parseFloat(la), lng=parseFloat(ln);
      return {lat:Number.isFinite(lat)?lat:null, lng:Number.isFinite(lng)?lng:null};
    }
    function normalizeTurno(v){
      const k=String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
      if(k.includes('tarde')) return 'tarde';
      if(k.includes('manana')||k.includes('mañana')) return 'manana';
      return '';
    }


    const normGiro = g => String(g||'').trim().toLowerCase();
    const OVERRIDE_COLORS = { 'asedipa': '#22c55e' };
    const PALETTE_HEX = [
      '#2563eb','#8b5cf6','#ef4444','#f59e0b','#06b6d4','#f472b6','#a855f7','#eab308',
      '#fb7185','#14b8a6','#0ea5e9','#94a3b8','#f97316','#84cc16','#f8fafc','#d946ef',
      '#10b981','#dc2626','#7c3aed','#3b82f6','#f43f5e','#22d3ee','#9333ea','#ca8a04',
      '#0891b2','#4f46e5','#65a30d','#ea580c','#0284c7'
    ].filter((v,i,arr)=>arr.indexOf(v)===i);
    let GIRO_COLOR_MAP = {};

    function buildGiroColorMap(giros){
      GIRO_COLOR_MAP = {};
      const used = new Set(Object.values(OVERRIDE_COLORS).map(c=>c.toLowerCase()));
      giros.forEach(g=>{ const k=normGiro(g); if(OVERRIDE_COLORS[k]) GIRO_COLOR_MAP[k]=OVERRIDE_COLORS[k]; });
      let pi=0, gen=0;
      giros.forEach(g=>{
        const k=normGiro(g); if(!k || GIRO_COLOR_MAP[k]) return;
        let hex;
        while(true){
          if(pi<PALETTE_HEX.length){ hex = PALETTE_HEX[pi++]; }
          else { const hue=(gen*137.508)%360; gen++; hex = hslToHex(hue,70,50); }
          if(!used.has(hex.toLowerCase()) && hex.toLowerCase()!=='#22c55e') break;
        }
        used.add(hex.toLowerCase());
        GIRO_COLOR_MAP[k]=hex;
      });
    }
    function hslToRgb(h, s, l){ s/=100; l/=100; const k=n=>(n+h/30)%12, a=s*Math.min(l,1-l);
      const f=n=>l-a*Math.max(-1,Math.min(k(n)-3,Math.min(9-k(n),1)));
      return [Math.round(255*f(0)),Math.round(255*f(8)),Math.round(255*f(4))]; }
    function rgbToHex(r,g,b){ const to=n=>n.toString(16).padStart(2,'0'); return `#${to(r)}${to(g)}${to(b)}`; }
    function hslToHex(h,s,l){ const [r,g,b]=hslToRgb(h,s,l); return rgbToHex(r,g,b); }

    const colorForGiro = g => GIRO_COLOR_MAP[normGiro(g)] || '#64748b';
    const strokeForTurno = t => (t==='tarde' ? '#6366f1' : '#f59e0b');

    function svgIcon(fill, stroke){
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
        <circle cx="14" cy="14" r="11" fill="${fill}" />
        <circle cx="14" cy="14" r="12.5" fill="none" stroke="${stroke}" stroke-width="3" />
      </svg>`;
      return { url:'data:image/svg+xml;charset=UTF-8,'+encodeURIComponent(svg),
               scaledSize:new google.maps.Size(28,28),
               anchor:new google.maps.Point(14,14) };
    }
    function popupHtml(a){
      return `
      <div style="min-width:260px;max-width:360px;font-family:inherit">
        <div style="background:#1a73e8;color:#fff;padding:10px;border-radius:6px 6px 0 0;margin:-8px -8px 8px -8px;font-weight:700">
          ${a.nombre}
        </div>
        <div><b>Giro:</b> ${esc(a.giro||'-')}</div>
        <div><b>Productos:</b> ${esc(a.productos||'-')}</div>
        <div><b>Zona:</b> ${esc(a.zona||'-')}</div>
        <div><b>Lugar exacto:</b> ${esc(a.lugar_exacto||'-')}</div>
        <div><b>Turno:</b> ${a.turno==='manana'?'Mañana':'Tarde'}</div>
        <div><b>Horario:</b> ${esc(a.horario||'-')}</div>
        <div><b>Licencia:</b> ${esc(a.licencia||'-')}</div>
        <div><b>Vigencia:</b> ${esc(a.vigencia||'-')}</div>
      </div>`;
    }

    /* ==================== Mapa ==================== */
    function clearMarkers(){ for(const m of markers) m.setMap && m.setMap(null); markers=[]; }

    function renderMarkers(data){
      clearMarkers();
      const bounds = new google.maps.LatLngBounds();
      const hasAdv = !!(google.maps.marker && google.maps.marker.AdvancedMarkerElement);

      data.forEach(a=>{
        const pos = {lat:a.lat, lng:a.lng};
        if(hasAdv){
          const node = document.createElement('div');
          node.className = 'marker-node';
          node.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
              <circle cx="14" cy="14" r="11" fill="${colorForGiro(a.giro)}" />
              <circle cx="14" cy="14" r="12.5" fill="none" stroke="${strokeForTurno(a.turno)}" stroke-width="3" />
            </svg>`;
          const mk = new google.maps.marker.AdvancedMarkerElement({ map, position:pos, title:a.nombre, content:node });
          mk.addListener('gmp-click', ()=>{ infoWindow.setContent(popupHtml(a)); infoWindow.open({anchor:mk,map}); node.classList.add('pulse'); setTimeout(()=>node.classList.remove('pulse'), 480); });
          markers.push(mk);
          bounds.extend(mk.position);
        }else{
          const mk = new google.maps.Marker({ map, position:pos, title:a.nombre, icon: svgIcon(colorForGiro(a.giro), strokeForTurno(a.turno)) });
          mk.addListener('click', ()=>{ infoWindow.setContent(popupHtml(a)); infoWindow.open({anchor:mk,map}); });
          markers.push(mk);
          bounds.extend(mk.getPosition());
        }
      });

      if(data.length) map.fitBounds(bounds, 60); else { map.setCenter(PACHACAMAC_CENTER); map.setZoom(13); }
    }

    /* ==================== Filtros/UI ==================== */
    function applyFilters(){
      const giro = document.getElementById('giroFilter').value;
      const turno = document.getElementById('turnoFilter').value;
      const q = document.getElementById('searchInput').value.trim().toLowerCase();

      return allData.filter(a=>{
        const has = Number.isFinite(a.lat) && Number.isFinite(a.lng);
        if(!has) return false;
        const gOk = (giro==='todos') || (String(a.giro).toLowerCase()===String(giro).toLowerCase());
        const tOk = (turno==='todos') || (a.turno===turno);
        const qOk = !q || [a.nombre,a.productos,a.zona,a.giro,a.lugar_exacto,a.horario,a.licencia,a.vigencia]
          .some(v=>String(v||'').toLowerCase().includes(q));
        return gOk && tOk && qOk;
      });
    }
    function updateStats(filtered){
      const zonas = [...new Set(filtered.map(a=>a.zona).filter(Boolean))];
      document.getElementById('totalCount').textContent = allData.length;
      document.getElementById('visibleCount').textContent = filtered.length;
      document.getElementById('activeZones').textContent = zonas.length;
    }
    function populateGiroFilterAndLegend(){
      const giros = [...new Set(allData.map(a=>a.giro).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
      buildGiroColorMap(giros);

      const sel = document.getElementById('giroFilter');
      sel.innerHTML = '<option value="todos">Todos</option>';
      giros.forEach(g=>{ const opt=document.createElement('option'); opt.value=g; opt.textContent=g; sel.appendChild(opt); });

      const cont = document.getElementById('legendGiros'); cont.innerHTML='';
      giros.forEach(g=>{
        const item = document.createElement('div'); item.className='legend-item';
        item.innerHTML = `<span class="legend-dot" style="background:${colorForGiro(g)}"></span> ${esc(g)}`;
        item.addEventListener('click', ()=>{
          document.getElementById('giroFilter').value = g;
          refresh();
        });
        cont.appendChild(item);
      });
    }
    function refresh(){
      const filtered = applyFilters();
      renderMarkers(filtered);
      updateStats(filtered);
      document.getElementById('btnKml').disabled = allData.length===0;
      document.getElementById('btnKmz').disabled = allData.length===0;
    }

    /* ==================== Carga de datos ==================== */
    async function loadFromUrl(name){
      const resp = await fetch(name);
      if(!resp.ok) throw new Error('No se pudo cargar '+name);
      const low = name.toLowerCase();
      if(low.endsWith('.xlsx')||low.endsWith('.xls')){
        const wb = XLSX.read(await resp.arrayBuffer(),{type:'array'});
        const sh = wb.Sheets[wb.SheetNames[0]];
        return XLSX.utils.sheet_to_json(sh,{defval:''});
      }else{
        const text = await resp.text();
        return new Promise((res,rej)=>Papa.parse(text,{header:true,delimiter:text.includes(';')?';':',',skipEmptyLines:true,complete:o=>res(o.data),error:rej}));
      }
    }
    async function autoLoad(){
      for(const n of DATA_CANDIDATES){
        try{return {rows: await loadFromUrl(n), filename:n};}catch(_){/* siguiente */ }
      }
      throw new Error(`No encontré ${DATA_CANDIDATES.join(' / ')} junto al HTML.`);
    }
    function normalizeRows(rows){
      const out=[];
      for(const row of rows){
        const n={}; for(const k of Object.keys(row)) n[normalizeKey(k)] = row[k];
        let lat = parseFloat(n['lat']), lng = parseFloat(n['lng']);
        if(!Number.isFinite(lat)||!Number.isFinite(lng)){
          const p = parseUbicacion(n['ubicacion'] ?? n['ubicaciOn']); lat=p.lat; lng=p.lng;
        }
        if(!Number.isFinite(lat)||!Number.isFinite(lng)) continue;
        let turno = normalizeTurno(n['turno']);
        if(!turno){ const hh=String(n['horario']||'').toUpperCase(); turno = hh.includes('PM') ? 'tarde' : 'manana'; }
        out.push({
          id: String(n['id']??''), nombre:String(n['nombre']??'').trim(),
          giro:String(n['giro']??'').trim(), productos:String(n['productos']??'').trim(),
          zona:String(n['zona']??'').trim(), lugar_exacto:String(n['lugar_exacto']??'').trim(),
          horario:String(n['horario']??'').trim(), licencia:String(n['licencia']??'').trim(),
          vigencia:String(n['vigencia']??'').trim(), turno, lat, lng
        });
      }
      return out;
    }

    /* ==================== Export KML/KMZ ==================== */
    const toHex = n => n.toString(16).padStart(2,'0');
    function hexToKml(hex){
      const h = hex.replace('#','');
      const r = parseInt(h.slice(0,2),16);
      const g = parseInt(h.slice(2,4),16);
      const b = parseInt(h.slice(4,6),16);
      return `ff${toHex(b)}${toHex(g)}${toHex(r)}`; // aabbggrr
    }
    const styleId = g => 'giro_'+normalizeKey(g).replace(/[^a-z0-9_]/g,'');
    function kmlColorForGiro(giro){ return hexToKml(colorForGiro(giro)); }

    function buildKml(data){
      const giros=[...new Set(data.map(d=>d.giro).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
      const styles=giros.map(g=>`
        <Style id="${styleId(g)}">
          <IconStyle><color>${kmlColorForGiro(g)}</color><scale>1.2</scale></IconStyle>
          <LabelStyle><scale>0.0</scale></LabelStyle>
        </Style>`).join('\n');

      const folder = (name, subset) => {
        if(!subset.length) return '';
        const placemarks = subset.map(a=>`
          <Placemark>
            <name>${esc(a.nombre)}</name>
            <styleUrl>#${styleId(a.giro)}</styleUrl>
            <description><![CDATA[
              <b>Giro:</b> ${esc(a.giro)}<br/>
              <b>Productos:</b> ${esc(a.productos)}<br/>
              <b>Zona:</b> ${esc(a.zona)}<br/>
              <b>Lugar exacto:</b> ${esc(a.lugar_exacto)}<br/>
              <b>Turno:</b> ${a.turno==='manana'?'Mañana':'Tarde'}<br/>
              <b>Horario:</b> ${esc(a.horario)}<br/>
              <b>Licencia:</b> ${esc(a.licencia)}<br/>
              <b>Vigencia:</b> ${esc(a.vigencia)}
            ]]></description>
            <Point><coordinates>${a.lng},${a.lat},0</coordinates></Point>
          </Placemark>`).join('\n');
        return `<Folder><name>${esc(name)}</name>${placemarks}</Folder>`;
      };

      const man = data.filter(d=>d.turno==='manana');
      const tar = data.filter(d=>d.turno==='tarde');

      return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Ambulantes — Pachacámac</name>
    ${styles}
    ${folder('Mañana', man)}
    ${folder('Tarde', tar)}
  </Document>
</kml>`;
    }
    function downloadBlob(name, blob){
      const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(()=>URL.revokeObjectURL(a.href), 1500);
    }

    /* ==================== Tema ==================== */
    function applyThemeUI(th){
      const icon = document.getElementById('themeIcon');
      const text = document.getElementById('themeText');
      if(th==='dark'){ icon.textContent='☀️'; text.textContent='Modo claro'; }
      else { icon.textContent='🌙'; text.textContent='Modo oscuro'; }
    }
    function mapIdForTheme(th){ return th==='dark' ? (MAP_ID_DARK || null) : (MAP_ID_LIGHT || null); }
    function switchMapId(th){
      const mid = mapIdForTheme(th);
      if(mid){ map.setOptions({ mapId: mid }); }
    }
    function setTheme(th){
      document.documentElement.setAttribute('data-theme', th);
      localStorage.setItem('prefers-theme', th);
      applyThemeUI(th);
      if(map) switchMapId(th);
    }

    /* ==================== Init ==================== */
    window.initMap = async function(){
      // Tema inicial
      const saved = localStorage.getItem('prefers-theme');
      setTheme(saved || 'light');

      if(!(window.google && google.maps)){ alert('No cargó Google Maps. Revisa tu API key / referrers.'); return; }
      map = new google.maps.Map(document.getElementById('map'), {
        center: PACHACAMAC_CENTER, zoom:13, mapTypeControl:false, streetViewControl:false, fullscreenControl:true,
        mapId: mapIdForTheme(theme()) || undefined
      });
      infoWindow = new google.maps.InfoWindow();

      // Ajusta offset de FABs según altura real del export
      adjustFabOffset();
      const ro = new ResizeObserver(adjustFabOffset);
      ro.observe(document.getElementById('exportBar'));
      window.addEventListener('resize', adjustFabOffset);

      // Toggle de tema
      document.getElementById('themeToggle').addEventListener('click', ()=>{
        const next = theme()==='dark' ? 'light' : 'dark';
        setTheme(next);
      });

      // Filtros
      document.getElementById('giroFilter').addEventListener('change', refresh);
      document.getElementById('turnoFilter').addEventListener('change', refresh);
      document.getElementById('searchInput').addEventListener('input', refresh);

      // FABs
      document.getElementById('btnReset').addEventListener('click', ()=>{
        document.getElementById('giroFilter').value = 'todos';
        document.getElementById('turnoFilter').value = 'todos';
        document.getElementById('searchInput').value = '';
        refresh();
      });
      document.getElementById('btnLoc').addEventListener('click', ()=>{
        if(!navigator.geolocation){ toast('Geolocalización no disponible', false); return; }
        navigator.geolocation.getCurrentPosition(pos=>{
          const {latitude:lat, longitude:lng} = pos.coords;
          map.panTo({lat,lng}); map.setZoom(16);
        }, ()=>toast('No se pudo obtener tu ubicación', false), {enableHighAccuracy:true,timeout:8000,maximumAge:0});
      });

      // Datos
      try{
        toast('Cargando datos…');
        const {rows, filename} = await autoLoad();
        allData = normalizeRows(rows);
        if(!allData.length) toast('No hay filas válidas con coordenadas.', false);
        else toast(`Cargado: ${filename} (${allData.length} registros)`);
        populateGiroFilterAndLegend();
        refresh();
      }catch(err){
        toast(err.message, false);
      }

      // Export
      document.getElementById('btnKml').addEventListener('click', ()=>{
        const only = document.getElementById('onlyVisible').checked;
        const data = only ? applyFilters() : allData;
        if(!data.length){ toast('No hay datos para exportar.', false); return; }
        const kml = buildKml(data);
        downloadBlob('ambulantes_pachacamac.kml', new Blob([kml],{type:'application/vnd.google-earth.kml+xml'}));
      });
      document.getElementById('btnKmz').addEventListener('click', async ()=>{
        const only = document.getElementById('onlyVisible').checked;
        const data = only ? applyFilters() : allData;
        if(!data.length){ toast('No hay datos para exportar.', false); return; }
        const zip = new JSZip(); zip.file('doc.kml', buildKml(data));
        const blob = await zip.generateAsync({type:'blob'});
        downloadBlob('ambulantes_pachacamac.kmz', blob);
      });
    };