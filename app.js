/* Automechanika Shanghai 26 · Lizarte · lógica de la app */
(function () {
  'use strict';

  const CFG = window.APP_CONFIG;
  const store = window.crearStore(CFG);
  const root = document.getElementById('app');

  // ═══════════ Utilidades ═══════════
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const nat = (a, b) => String(a || '').localeCompare(String(b || ''), 'es', { numeric: true, sensitivity: 'base' });
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const dos = n => String(n).padStart(2, '0');
  const color = u => 'u' + Math.max(0, CFG.USUARIOS.indexOf(u));
  // Sesión solo mientras la app está abierta: al volver a abrirla pregunta otra vez el usuario
  const ss = {
    get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* nada */ } },
    del(k) { try { sessionStorage.removeItem(k); } catch (e) { /* nada */ } }
  };
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* nada */ } }
  };

  function fechaCorta(iso) {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    return isNaN(d) ? iso : d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  function toast(texto) {
    document.querySelectorAll('.toast').forEach(x => x.remove());
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = texto;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2800);
  }

  // ═══════════ Estado ═══════════
  const VIAJE = 'viaje.json';
  const rutaEmpresa = id => 'empresas/' + id + '.json';
  const state = {
    user: null,
    tab: ({ visitar: 'planning' })[ls.get('ams26:tab')] || ls.get('ams26:tab') || 'general',
    modoVisitar: ls.get('ams26:modoVisitar') || 'zona',
    filtroPlan: ls.get('ams26:filtroPlan') || 'todos',
    modoPlan: ls.get('ams26:modoPlan') || 'dia',
    modoRuta: ls.get('ams26:modo') || 'pabellones',
    filtro: 'todos',
    viaje: { vuelos: [], hoteles: [], usuarios: {} },
    empresas: [],
    estado: { tipo: 'info', texto: '' }
  };

  const bloque = (doc, u) => ((doc && doc.usuarios) || {})[u || state.user] || {};
  const tipoDe = e => (e && e.tipo) || 'feria';
  // Prioridad de visita en tres niveles (compatible con los valores antiguos importante/secundario)
  const NIVELES = [
    { k: 'principal', txt: '⭐ Principal', plural: '⭐ Principales', badge: 'verde' },
    { k: 'alta', txt: 'Secundaria alta', plural: 'Secundaria alta', badge: 'amarillo' },
    { k: 'baja', txt: 'Secundaria baja', plural: 'Secundaria baja', badge: 'gris' },
    { k: 'sin', txt: 'Sin prioridad', plural: 'Sin prioridad', badge: 'gris' }
  ];
  const nivel = e => {
    const c = String((e && e.categoria) || '').toLowerCase();
    if (c === 'alta' || c === 'secundaria-alta') return 1;
    if (c === 'baja' || c === 'secundario' || c === 'secundaria-baja') return 2;
    if (c === 'sin' || c === 'sin prioridad' || c === 'sin-prioridad') return 3;
    return 0;
  };
  const esImportante = e => nivel(e) === 0;
  const badgeNivel = e => `<span class="badge ${NIVELES[nivel(e)].badge}">${NIVELES[nivel(e)].txt}</span>`;
  const claseNivel = e => tipoDe(e) === 'feria' ? 'niv' + nivel(e) : '';
  // Competidor a vigilar (decisión del estado del proyecto del 15-11): se marca en la ficha
  const badgeComp = e => e && e.competidor ? '<span class="badge comp">👁 Competidor</span>' : '';
  const badgeLinea = e => (e.prep && e.prep.linea) ? `<span class="badge azul">${esc(e.prep.linea)}</span>` : '';
  // Pabellones MM (MM2, MM4, MM6, MM8): están en la entreplanta del NECC, zona de piezas y componentes
  const pabTxt = p => { p = String(p || '').trim(); return p.replace(/\b(MM\s*\d)\b/gi, '$1 (entreplanta)'); };
  // Identificación dentro de las principales (criterios de la reunión con Óscar).
  // Sale sola del "Grupo de producto" del Excel; en la ficha se puede forzar o quitar (campo ident).
  const IDENTS = [
    { k: 'P1', txt: 'Dirección refabricación real', re: /^direcci[oó]n\s*·\s*reman/i },
    { k: 'P2', txt: 'Dirección pieza nueva', re: /^direcci[oó]n\s*·\s*fabricante/i },
    { k: 'P3', txt: 'Reman fuera de dirección', re: /^reman fuera de direcci/i },
    { k: 'P4', txt: 'Reman, cascos y contactos', re: /^reman,?\s*cascos/i },
    { k: 'P5', txt: 'Casquero proveedor de cascos', re: /^casquero/i }
  ];
  const criterio = e => {
    if (!e || tipoDe(e) !== 'feria' || e.ident === 'no') return -1;
    const fijo = IDENTS.findIndex(c => c.k === e.ident);
    if (fijo >= 0) return fijo;
    if (nivel(e) !== 0) return -1;
    return IDENTS.findIndex(c => c.re.test((e.prep && e.prep.grupo) || ''));
  };
  const ordCriterio = e => { const i = criterio(e); return i < 0 ? 99 : i; };
  const identTxt = e => { const i = criterio(e); return i < 0 ? '' : IDENTS[i].k + ' · ' + IDENTS[i].txt; };
  const badgeIdent = e => { const i = criterio(e); return i < 0 ? '' : `<span class="ident p${i + 1}"><b>${IDENTS[i].k}</b>${esc(IDENTS[i].txt)}</span>`; };
  const feria = () => state.empresas.filter(e => tipoDe(e) === 'feria');
  const visitas = () => state.empresas.filter(e => tipoDe(e) === 'visita');
  const seleccionadas = () => state.empresas.filter(e => tipoDe(e) === 'seleccionada')
    .sort((a, b) => (b.prioritaria ? 1 : 0) - (a.prioritaria ? 1 : 0) || ((a.prep || {}).numero || 99) - ((b.prep || {}).numero || 99) || nat(a.nombre, b.nombre));
  const desguaces = () => state.empresas.filter(e => tipoDe(e) === 'desguace')
    .sort((a, b) => ((a.prep || {}).numero || 99) - ((b.prep || {}).numero || 99) || nat(a.nombre, b.nombre));
  const origenTxt = e => ({ seleccionada: 'Seleccionada', desguace: 'Desguace', visita: 'Otra' })[tipoDe(e)] || 'Otra';
  // Empresa de la feria que corresponde a una seleccionada (por nombre)
  const empresaFeria = e => e && e.enFeria ? feria().find(f => norm(f.nombre) === norm(e.enFeria)) : null;
  const empresaPorId = id => state.empresas.find(e => e.id === id);
  // Una empresa, una ficha: la ficha de feria unida a Seleccionadas guarda solo los datos de feria; lo demás vive en la principal
  const principal = e => (e && e.unidaA && empresaPorId(e.unidaA)) || e;
  const feriaUnida = e => e && tipoDe(e) === 'seleccionada' && e.feriaId ? empresaPorId(e.feriaId) || null : null;

  store.onEstado(s => {
    state.estado = s;
    const el = document.getElementById('chip-estado');
    if (el) { el.className = 'chip estado ' + s.tipo; el.textContent = s.texto; }
  });

  function chipConexion() {
    const el = document.getElementById('chip-online');
    if (!el) return;
    el.className = 'chip ' + (navigator.onLine ? 'ok' : 'aviso');
    el.innerHTML = '<span class="punto"></span>' + (navigator.onLine ? 'Online' : 'Sin conexión');
  }
  window.addEventListener('online', chipConexion);
  window.addEventListener('offline', chipConexion);

  async function recargar() {
    state.viaje = Object.assign({ vuelos: [], hoteles: [], usuarios: {} }, await store.leer(VIAJE) || {});
    state.empresas = await store.listar('empresas/');
  }

  // Guardado de un documento: actualiza el estado con la versión resultante
  async function parchear(ruta, parche) {
    const doc = await store.parchear(ruta, parche);
    if (ruta === VIAJE) state.viaje = Object.assign({ vuelos: [], hoteles: [], usuarios: {} }, doc);
    else {
      const i = state.empresas.findIndex(e => rutaEmpresa(e.id) === ruta);
      if (i >= 0) state.empresas[i] = doc; else state.empresas.push(doc);
    }
    return doc;
  }

  // ═══════════ Inicio de sesión: solo hay que decir quién eres (sin contraseña) ═══════════
  let loginUser = null;

  function pintarLogin() {
    root.innerHTML = `
      <div class="login">
        <div class="login-card">
          <img src="lizarte-logo.png" alt="Lizarte" class="login-logo" width="335" height="96">
          <p class="login-titulo">${esc(CFG.TITULO || '')}</p>
          <p class="login-mision">Automechanika Shanghai · 2 al 5 de diciembre de 2026</p>
          <p class="login-sub">Acceso Lizarte · ${store.modo === 'sharepoint' ? 'sincronización SharePoint' : 'datos en este dispositivo'}</p>
          <p class="login-hint">¿Quién eres?</p>
          <div class="login-users">
            ${CFG.USUARIOS.map(u => `<button type="button" class="login-user" data-login="${esc(u)}">Soy ${esc(u)}</button>`).join('')}
          </div>
          <p class="login-version">Versión ${esc(CFG.VERSION)}</p>
        </div>
      </div>`;
  }

  async function entrar(u) {
    state.user = u;
    root.innerHTML = '<div class="cargando"><img src="lizarte-logo.png" alt="Lizarte" width="200"><p>Cargando…</p></div>';
    await store.iniciar();
    await recargar();
    pintar();
  }

  function salir() {
    ss.del('ams26:sesion');
    state.user = null;
    loginUser = null;
    cerrarModal();
    pintarLogin();
  }

  // ═══════════ Notas: cada uno escribe en su bloque, el del otro es de solo lectura ═══════════
  function notasHTML(ruta, doc, campo, titulo) {
    return `
      <div class="notas">
        ${titulo ? `<h3 class="sub">${titulo}</h3>` : ''}
        ${CFG.USUARIOS.map(u => {
          const propia = u === state.user;
          return `
            <label class="nota ${color(u)} ${propia ? '' : 'ajena'}">
              <span class="nota-head"><span class="avatar sm ${color(u)}">${esc(u[0])}</span>${propia ? 'Tus notas' : 'Notas de ' + esc(u)}${propia ? '' : '<span class="lock">solo lectura</span>'}</span>
              <textarea data-doc="${esc(ruta)}" data-campo="${esc(campo)}" rows="3" ${propia ? '' : 'readonly'}
                placeholder="${propia ? 'Escribe aquí…' : 'Sin notas todavía'}">${esc(bloque(doc, u)[campo] || '')}</textarea>
            </label>`;
        }).join('')}
      </div>`;
  }

  const temporizadores = {};
  document.addEventListener('input', e => {
    const t = e.target.closest('textarea[data-doc]');
    if (!t || t.readOnly || !state.user) return;
    const ruta = t.dataset.doc, campo = t.dataset.campo, valor = t.value;
    const doc = ruta === VIAJE ? state.viaje : state.empresas.find(x => rutaEmpresa(x.id) === ruta);
    if (doc) { doc.usuarios = doc.usuarios || {}; doc.usuarios[state.user] = Object.assign({}, doc.usuarios[state.user], { [campo]: valor }); }
    const k = ruta + '|' + campo;
    clearTimeout(temporizadores[k]);
    temporizadores[k] = setTimeout(() => parchear(ruta, { usuario: state.user, bloque: { [campo]: valor } }), 700);
  });

  // ═══════════ Estructura ═══════════
  const TABS = [
    ['general', '🏨', 'General'],
    ['eventos', '📅', 'Eventos'],
    ['seleccionadas', '🎯', 'Seleccionadas'],
    ['ruta', '🗺️', 'Ruta optimizada'],
    ['planning', '🗓️', 'Planning post feria'],
    ['desguaces', '♻️', 'Preselección de desguaces'],
    ['resumen', '📊', 'Resumen'],
    ['presentaciones', '📁', 'Presentaciones']
  ];

  function pintar() {
    const y = window.scrollY;
    const vistas = { general: vistaGeneral, eventos: vistaEventos, seleccionadas: vistaSeleccionadas, ruta: vistaRuta, planning: vistaPlanning, visitar: vistaPlanning, desguaces: vistaDesguaces, resumen: vistaResumen, presentaciones: vistaPresentaciones };
    root.innerHTML = `
      <header class="marca">
        <img src="lizarte-logo.png" alt="Lizarte" class="marca-logo" width="120" height="34">
        <div class="marca-der">
          <span class="marca-user">${esc(state.user)}</span>
          <span class="avatar ${color(state.user)}">${esc(state.user[0])}</span>
          <button class="icon-btn" data-accion="menu" aria-label="Menú">⋯</button>
        </div>
      </header>
      <nav class="tiles">
        ${TABS.map(([id, ico, txt]) => `<button class="tile ${state.tab === id ? 'on' : ''}" data-tab="${id}"><span class="tile-ico">${ico}</span><span>${txt}</span></button>`).join('')}
      </nav>
      <div class="chips-estado">
        <span id="chip-online" class="chip"></span>
        <span id="chip-estado" class="chip estado ${esc(state.estado.tipo)}">${esc(state.estado.texto)}</span>
      </div>
      <main>${(vistas[state.tab] || vistaGeneral)()}</main>`;
    chipConexion();
    window.scrollTo(0, y);
  }

  // ═══════════ Vuelos y hoteles ═══════════
  const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const fechaHora = (f, h) => { const d = new Date((f || '') + 'T' + (h || '00:00') + ':00'); return isNaN(d) ? null : d; };
  const diaTxt = d => DIAS[d.getDay()] + ' ' + d.getDate() + ' ' + MESES[d.getMonth()];
  const horaTxt = d => dos(d.getHours()) + ':' + dos(d.getMinutes());

  // A qué hora estar en el aeropuerto y cuándo cierra la facturación
  function horasAeropuerto(v) {
    const sal = fechaHora(v.fecha, v.hora);
    if (!sal) return null;
    const ant = Number(v.antelacion) || 3;
    const llegar = new Date(sal.getTime() - ant * 3600000);
    const cierre = v.cierre ? new Date(sal.getTime() - Number(v.cierre) * 60000) : null;
    return { llegar, cierre, ant, otroDia: llegar.toDateString() !== sal.toDateString() };
  }

  function tarjetaVuelo(v) {
    const sal = fechaHora(v.fecha, v.hora), lle = fechaHora(v.llegadaFecha, v.llegadaHora);
    const masDias = sal && lle ? Math.round((new Date(lle.toDateString()) - new Date(sal.toDateString())) / 86400000) : 0;
    const ae = horasAeropuerto(v);
    const lugar = (cod, nombre, t) => `<span class="v-lugar"><b>${esc(cod || nombre || '¿?')}</b>${t ? ' ' + esc(t) : ''}${cod && nombre ? `<span class="muted small">${esc(nombre)}</span>` : ''}</span>`;
    return `
      <button class="card vuelo2" data-editar="vuelo" data-id="${esc(v.id)}">
        <span class="v-cab"><b>${sal ? esc(diaTxt(sal)) : esc(v.fecha || '')}</b><span class="badge rosa">${esc(v.numero || 'Vuelo')}</span>${v.aerolinea ? `<span class="muted small">${esc(v.aerolinea)}</span>` : ''}</span>
        <span class="v-ruta">
          <span class="v-punto"><span class="v-hora">${esc(v.hora || '··:··')}</span>${lugar(v.codOrigen, v.origen, v.terminalOrigen)}</span>
          <span class="v-linea">${v.duracion ? `<span class="muted small">${esc(v.duracion)}</span>` : ''}<span class="v-flecha">✈</span></span>
          <span class="v-punto"><span class="v-hora">${esc(v.llegadaHora || '··:··')}${masDias > 0 ? `<sup class="v-mas">+${masDias}</sup>` : ''}</span>${lugar(v.codDestino, v.destino, v.terminalDestino)}</span>
        </span>
        ${ae ? `<span class="v-aero">🕒 Estar en el aeropuerto: <b>${ae.otroDia ? esc(diaTxt(ae.llegar)) + ', ' : ''}${esc(horaTxt(ae.llegar))}</b> (${ae.ant} h antes)${ae.cierre ? ` · la facturación cierra a las ${esc(horaTxt(ae.cierre))}` : ''}</span>` : ''}
        ${ae && ae.otroDia ? `<span class="v-aviso">⚠️ Sale de madrugada: hay que ir al aeropuerto la noche del ${esc(diaTxt(ae.llegar))}.</span>` : ''}
        ${v.clase || v.avion ? `<span class="muted small">${[v.clase, v.avion].filter(Boolean).map(esc).join(' · ')}</span>` : ''}
      </button>`;
  }

  function tarjetaHotel(h) {
    const noches = h.entrada && h.salida ? Math.round((new Date(h.salida) - new Date(h.entrada)) / 86400000) : 0;
    const ent = fechaHora(h.entrada), sal = fechaHora(h.salida);
    return `
      <div class="card hotel2">
        <div class="h-cab">
          <div><b class="h-nombre">${esc(h.nombre || 'Hotel')}</b>${h.nombreZh ? `<div class="zh">${esc(h.nombreZh)}</div>` : ''}</div>
          <button class="icon-btn" data-editar="hotel" data-id="${esc(h.id)}" aria-label="Editar hotel">✏️</button>
        </div>
        <div class="muted">${esc(h.ciudad || '')}${ent ? ' · ' + esc(diaTxt(ent)) : ''}${sal ? ' → ' + esc(diaTxt(sal)) : ''}${noches > 0 ? ' · ' + noches + (noches === 1 ? ' noche' : ' noches') : ''}</div>
        ${h.direccionZh ? `<div class="h-dir zh-grande">${esc(h.direccionZh)}</div>` : ''}
        ${h.direccion ? `<div class="h-dir muted">${esc(h.direccion)}</div>` : ''}
        ${h.telefono ? `<div class="muted small">📞 <a href="tel:${esc(h.telefono.replace(/\s/g, ''))}">${esc(h.telefono)}</a></div>` : ''}
        <div class="acciones-fila h-botones">
          ${h.direccionZh ? `<button class="btn primary" data-copiar="${esc(h.direccionZh)}">📋 Copiar para DiDi (中文)</button>` : ''}
          ${h.direccion ? `<button class="btn soft" data-copiar="${esc(h.direccion)}">📋 Copiar en inglés</button>` : ''}
        </div>
      </div>`;
  }

  async function copiarTexto(t, msg) {
    let ok = false;
    try { await navigator.clipboard.writeText(t); ok = true; } catch (e) {
      try { const ta = document.createElement('textarea'); ta.value = t; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); ok = document.execCommand('copy'); ta.remove(); } catch (e2) { ok = false; }
    }
    toast(ok ? (msg || 'Dirección copiada. Pégala en DiDi en el campo de destino.') : 'No se pudo copiar. Mantén pulsado el texto para copiarlo.');
  }

  // ═══════════ General: organización del viaje ═══════════
  function cuentaAtras() {
    const vuelos = [...state.viaje.vuelos].filter(v => v.fecha).sort((a, b) => nat(a.fecha + (a.hora || ''), b.fecha + (b.hora || '')));
    const primero = vuelos[0];
    const objetivo = primero ? new Date(primero.fecha + 'T' + (primero.hora || '00:00')) : new Date(CFG.FECHAS_FERIA.inicio + 'T09:00');
    const fin = new Date(CFG.FECHAS_FERIA.fin + 'T23:59');
    const ahora = new Date();
    const dias = Math.ceil((objetivo - ahora) / 86400000);
    let grande, texto;
    if (ahora > fin) { grande = '¡Hecho!'; texto = 'La feria ha terminado'; }
    else if (dias <= 0) { grande = '¡Ya!'; texto = primero ? 'Viaje en marcha' : 'Feria en marcha'; }
    else { grande = dias + (dias === 1 ? ' día' : ' días'); texto = primero ? 'Salida ' + esc(primero.origen || '') + ' · ' + esc(fechaCorta(primero.fecha)) + (primero.hora ? ' ' + esc(primero.hora) : '') : 'Hasta el inicio de la feria'; }
    return `<div class="card hero menta"><div class="hero-et">⏱️ Cuenta atrás</div><div class="hero-grande">${grande}</div><div class="hero-txt">${texto}</div></div>`;
  }

  function vistaGeneral() {
    const vuelos = [...state.viaje.vuelos].sort((a, b) => nat((a.fecha || '') + (a.hora || ''), (b.fecha || '') + (b.hora || '')));
    const hoteles = [...state.viaje.hoteles].sort((a, b) => nat(a.entrada, b.entrada));
    return `
      <div class="hero-fila">
        <div class="card hero azul">
          <h1>${esc(CFG.EVENTO)}</h1>
          <p class="hero-txt">2 al 5 de diciembre · ${esc(CFG.FECHAS_FERIA.lugar)} · Lizarte</p>
          <div class="hero-banda"><span><b>ES</b> España</span><span><b>CN</b> China</span></div>
          <div class="pastilla">China +7 h respecto a España</div>
        </div>
        ${cuentaAtras()}
      </div>

      <section>
        <div class="sec-head"><h2>✈️ Vuelos</h2><button class="btn soft" data-nuevo="vuelo">+ Añadir</button></div>
        ${vuelos.length ? vuelos.map(tarjetaVuelo).join('') : '<p class="vacio">Todavía no hay vuelos. Añade el primero.</p>'}
        ${vuelos.length ? '<p class="nota-info">Horarios en hora local de cada aeropuerto. La hora para estar en el aeropuerto es orientativa: 3 h antes en vuelos internacionales.</p>' : ''}
      </section>

      <section>
        <div class="sec-head"><h2>🏨 Hoteles</h2><button class="btn soft" data-nuevo="hotel">+ Añadir</button></div>
        ${hoteles.length ? hoteles.map(tarjetaHotel).join('') : '<p class="vacio">Todavía no hay hoteles.</p>'}
      </section>

      ${resumenPlanHTML()}

      <section class="card bloque">${notasHTML(VIAJE, state.viaje, 'notasViaje', '📝 Notas del viaje')}</section>`;
  }

  // Plan día a día después de la feria (viaje.json → planTrasFeria)
  function resumenPlanHTML() {
    const l = enPlanning(), act = l.filter(e => confDe(e) !== 'no');
    if (!l.length) return '';
    const n = k => act.filter(e => confDe(e) === k).length;
    const mov = act.filter(movidaDe).length;
    return `
      <section>
        <div class="sec-head"><h2>🗓️ Planning post feria</h2></div>
        <button class="card fila" data-tab="planning">
          <span class="fila-body"><b>${act.length} visitas previstas después de la feria</b>
          <span class="muted">✅ ${n('confirmada')} confirmadas · ⏳ ${n('pendiente')} pendientes${mov ? ' · ↪ ' + mov + ' cambiadas de día' : ''}${l.length - act.length ? ' · ❌ ' + (l.length - act.length) + ' no pueden' : ''}</span></span>
          <span class="flecha-der">›</span>
        </button>
      </section>`;
  }

  // ═══════════ Eventos: Automechanika Shanghai y visita a empresas ═══════════
  function marcasEmpresa(e) {
    return CFG.USUARIOS.map(u => {
      const b = bloque(e, u);
      const n = (b.fotos || []).length;
      if (!(b.texto || '').trim() && !n) return '';
      return `<span class="marca-u ${color(u)}" title="${esc(u)}"><span class="avatar xs ${color(u)}">${esc(u[0])}</span>${(b.texto || '').trim() ? '📝' : ''}${n ? '📷' + n : ''}</span>`;
    }).join('');
  }

  function tarjetaEmpresa(e) {
    const t = tipoDe(e);
    if (t === 'seleccionada') return tarjetaSeleccionada(e);
    if (t === 'desguace') return tarjetaDesguace(e);
    const linea = t === 'visita'
      ? [e.ciudad, e.fecha ? fechaCorta(e.fecha) : '', e.hora].filter(Boolean).map(esc).join(' · ')
      : 'Pab. ' + esc(pabTxt(e.pabellon) || '¿?') + ' · Stand ' + esc(e.stand || '¿?');
    const pr = principal(e);
    const resumen = CFG.USUARIOS.map(u => bloque(pr, u).texto).find(t => (t || '').trim()) || '';
    return `
      <div class="card empresa ${claseNivel(e)} ${e.visitado ? 'hecho-suave' : ''}">
        <button class="emp-body" data-ficha="${esc(e.id)}">
          ${t === 'feria' ? badgeIdent(e) : ''}
          <span class="emp-top"><b>${esc(e.nombre || 'Sin nombre')}</b>${e.visitado ? '<span class="badge menta">✓ Visitado</span>' : ''}</span>
          ${e.nombreZh ? `<span class="zh">${esc(e.nombreZh)}</span>` : ''}
          <span class="muted">${linea}</span>
          ${pr.contacto ? `<span class="muted small">👤 ${esc(pr.contacto)}${pr.rol ? ' · ' + esc(pr.rol) : ''}</span>` : ''}
          ${t === 'feria' ? avisoFabrica(e) : ''}
          ${tieneWx(pr) ? '<span class="muted small wx-linea">💬 Tiene WeChat o móvil</span>' : ''}
          ${e.ciudad && t === 'feria' ? `<span class="muted small">📍 ${esc(e.ciudad)}${e.pais && e.pais !== 'China' ? ', ' + esc(e.pais) : ''}</span>` : ''}
          ${pr !== e ? `<span class="muted small">🎯 Ficha única con Seleccionadas (${esc(pr.nombre)})</span>` : ''}
          ${lineaVisita(pr)}
          ${resumen ? `<span class="extracto">${esc(resumen.slice(0, 140))}${resumen.length > 140 ? '…' : ''}</span>` : ''}
          ${e.prep && e.prep.grupo ? `<span class="muted small">🔧 ${esc(e.prep.grupo)}</span>` : ''}
          <span class="tags">${t === 'feria' ? badgeNivel(e) : '<span class="badge lila">🏢 Visita</span>'}${badgeComp(pr)}${badgeRango(pr)}${badgeLinea(e)}${marcasEmpresa(pr)}</span>
        </button>
        <div class="emp-pie">${botonVisita(e)}</div>
      </div>`;
  }

  // Botón para marcar la empresa como visita a fábrica
  // Botón para meter o sacar la empresa del Planning post feria (la única lista de visitas)
  const botonVisita = e => { const p = principal(e), on = estaEnPlan(p), fija = tipoDe(p) === 'visita';
    return `<button class="btn-visita ${on ? 'on' : ''}" data-visita="${esc(p.id)}" ${fija ? 'disabled' : ''}>${on ? '✓ Planning' : '🗓️ Planning'}</button>`; };
  const lineaVisita = e => estaEnPlan(e)
    ? `<span class="v-plan">🗓️ ${esc(e.fecha ? diaTxt(fechaHora(e.fecha)) : 'Sin día')}${e.hora ? ' · ' + esc(e.hora) : ''} · ${CONF[confDe(e)].ico} ${esc(CONF[confDe(e)].corto)}${e.quien ? ' · ' + esc(e.quien) : ''}${e.visitaHecha ? ' · ✓ hecha' : ''}</span>` : '';

  // Prioridad de visita tras la feria (A sí o sí, B muy recomendable, C si hay tiempo) y día previsto
  const RANGOS = { A: 'A · visitar sí o sí', B: 'B · muy recomendable', C: 'C · si hay tiempo' };
  const badgeRango = e => {
    if (!e || !e.rango) return '';
    const d = e.fecha ? fechaHora(e.fecha) : null;
    return `<span class="badge rango r${esc(e.rango)}">🗓 ${esc(e.rango)}${d ? ' · ' + diaTxt(d) : ''}</span>`;
  };

  function lineaFeria(e) {
    const f = empresaFeria(e);
    if (!f) return '';
    return `<span class="en-feria" data-ficha="${esc(f.id)}">🏭 ${e.enFeriaDuda ? 'Posiblemente en la feria' : 'También en la feria'}: Pab. ${esc(pabTxt(f.pabellon) || '¿?')} · Stand ${esc(f.stand || '¿?')} ›</span>`;
  }

  function tarjetaSeleccionada(e) {
    const p = e.prep || {};
    const resumen = CFG.USUARIOS.map(u => bloque(e, u).texto).find(t => (t || '').trim()) || '';
    return `
      <div class="card empresa selec ${e.prioritaria ? 'imp' : ''}">
        <button class="selec-body" data-ficha="${esc(e.id)}">
          <span class="emp-top"><b>${esc(e.nombre || 'Sin nombre')}</b>${e.visitaHecha || e.visitado ? '<span class="badge menta">✓ Visitada</span>' : ''}</span>
          ${e.nombreZh ? `<span class="zh">${esc(e.nombreZh)}</span>` : ''}
          ${[e.ciudad, e.pais && e.pais !== 'China' ? e.pais : ''].filter(Boolean).length ? `<span class="muted small">📍 ${esc([e.ciudad, e.pais && e.pais !== 'China' ? e.pais : ''].filter(Boolean).join(', '))}</span>` : ''}
          ${p.procedencia ? `<span class="muted small">📥 ${esc(p.procedencia)}</span>` : ''}
          ${p.tamano ? `<span class="muted small">👥 ${esc(p.tamano)}</span>` : ''}
          ${p.observacion ? `<span class="extracto">${esc(p.observacion)}</span>` : ''}
          ${lineaVisita(e)}
          ${resumen ? `<span class="extracto nota-txt">📝 ${esc(resumen.slice(0, 140))}${resumen.length > 140 ? '…' : ''}</span>` : ''}
          <span class="tags">${e.prioritaria ? '<span class="badge rosa">⭐ Prioritaria</span>' : ''}<span class="badge azul">🎯 Seleccionada</span>${badgeComp(e)}${badgeRango(e)}${marcasEmpresa(e)}</span>
        </button>
        ${lineaFeria(e)}
        <div class="emp-pie">${botonVisita(e)}</div>
      </div>`;
  }

  function vistaSeleccionadas() {
    const lista = seleccionadas();
    const prio = lista.filter(e => e.prioritaria).length;
    return `
      <section>
        <div class="sec-head"><h2>🎯 Seleccionadas</h2></div>
        <div class="card cabecera">
          <span class="badge azul">CANDIDATOS · CHINA</span>
          <h2 class="titulo-serif">Empresas seleccionadas</h2>
          <p class="muted">De entre las propuestas por las 3 oficinas del ICEX (Pekín, Shanghái y Cantón), Mr Xie e investigación propia</p>
          <p class="muted">${lista.length} empresas · ${prio} prioritarias · ${lista.filter(e => e.visitado).length} visitadas · ${lista.filter(e => empresaFeria(e)).length} también en la feria</p>
        </div>
        <div class="acciones-fila"><button class="btn primary" data-nuevo="seleccionada">+ Añadir empresa</button></div>
        ${lista.length ? lista.map(tarjetaSeleccionada).join('') : '<p class="vacio">Aún no hay empresas seleccionadas.</p>'}
      </section>`;
  }

  // ═══════════ Preselección de desguaces ═══════════
  const corta = (t, n) => { t = String(t || ''); return t.length > n ? t.slice(0, n).replace(/\s+\S*$/, '') + '…' : t; };
  function tarjetaDesguace(e) {
    const p = e.prep || {};
    const resumen = CFG.USUARIOS.map(u => bloque(e, u).texto).find(t => (t || '').trim()) || '';
    return `
      <div class="card empresa desg">
        <button class="selec-body" data-ficha="${esc(e.id)}">
          <span class="emp-top"><b>${p.numero ? p.numero + '. ' : ''}${esc(e.nombre || 'Sin nombre')}</b>${e.visitaHecha || e.visitado ? '<span class="badge menta">✓ Visitado</span>' : ''}</span>
          ${e.nombreZh ? `<span class="zh">${esc(e.nombreZh)}</span>` : ''}
          ${e.ciudad ? `<span class="muted small">📍 ${esc(e.ciudad)}</span>` : ''}
          ${p.bases ? `<span class="muted small">🏗 ${esc(corta(p.bases, 120))}</span>` : ''}
          ${p.volumen ? `<span class="muted small">🚗 ${esc(p.volumen)}</span>` : ''}
          ${p.refab ? `<span class="muted small">🔧 ${esc(corta(p.refab, 120))}</span>` : ''}
          ${p.aFavor ? `<span class="d-pro">✅ ${esc(p.aFavor)}</span>` : ''}
          ${p.enContra ? `<span class="d-contra">⚠️ ${esc(p.enContra)}</span>` : ''}
          ${p.novedades ? `<span class="d-nuevo">🔎 ${esc(corta(p.novedades, 170))}</span>` : ''}
          ${lineaVisita(e)}
          ${resumen ? `<span class="extracto nota-txt">📝 ${esc(resumen.slice(0, 140))}${resumen.length > 140 ? '…' : ''}</span>` : ''}
          <span class="tags"><span class="badge desg">♻️ Desguace</span>${p.propiedadCorta ? `<span class="badge gris">${esc(p.propiedadCorta)}</span>` : ''}${badgeRango(e)}${marcasEmpresa(e)}</span>
        </button>
        <div class="emp-pie">${botonVisita(e)}</div>
      </div>`;
  }

  function vistaDesguaces() {
    const todos = desguaces();
    const lista = todos.filter(e => !e.otroDesguace);
    const otros = todos.filter(e => e.otroDesguace);
    const n = state.viaje.notaDesguaces || {};
    return `
      <section>
        <div class="sec-head"><h2>♻️ Preselección de desguaces</h2></div>
        <div class="card cabecera">
          <span class="badge desg">DESGUACES · CHINA</span>
          <h2 class="titulo-serif">Preselección de desguaces</h2>
          <p class="muted">Los cinco de la pestaña «Preselección desguaces» del Excel Desguaces_China, ampliados con una búsqueda propia (15-11-2026).</p>
          <p class="muted">${lista.length} desguaces · ${lista.filter(estaEnPlan).length} en el planning · ${lista.filter(e => e.visitaHecha || e.visitado).length} visitados</p>
          <div class="aviso-desg"><b>Regla clave:</b> un desguace solo puede vender cajas de dirección a un refabricador chino certificado. Lizarte necesita ese refabricador como socio o intermediario.</div>
          ${n.normativa ? `<p class="muted small">📜 ${esc(n.normativa)}</p>` : ''}
          ${n.guangdong ? `<p class="muted small">🧭 ${esc(n.guangdong)}</p>` : ''}
        </div>
        <div class="acciones-fila"><button class="btn primary" data-nuevo="desguace">+ Añadir desguace</button></div>
        ${lista.length ? lista.map(tarjetaDesguace).join('') : '<p class="vacio">Aún no hay desguaces en la preselección.</p>'}
        ${otros.length ? `<h3 class="grupo">Otros desguaces del planning (${otros.length})</h3>${otros.map(tarjetaDesguace).join('')}` : ''}
      </section>`;
  }

  function vistaEventos() {
    const lista = feria().sort((a, b) => nat(a.nombre, b.nombre));
    const imp = lista.filter(esImportante);
    const porNivel = [0, 1, 2, 3].map(n => lista.filter(e => nivel(e) === n));
    // Las principales van subdivididas por identificación (P1…P4) y luego el resto
    const conSubgrupos = items => {
      let actual = null;
      return [...items].sort((a, b) => ordCriterio(a) - ordCriterio(b) || nat(a.nombre, b.nombre)).map(e => {
        const i = criterio(e);
        const g = i < 0 ? 'Otras principales' : IDENTS[i].k + ' · ' + IDENTS[i].txt;
        const cab = g !== actual ? `<h4 class="subgrupo ${i < 0 ? '' : 'p' + (i + 1)}">${esc(g)} (${items.filter(x => criterio(x) === i).length})</h4>` : '';
        actual = g;
        return cab + tarjetaEmpresa(e);
      }).join('');
    };
    const grupo = (titulo, items, abierto, sub) => items.length ? `
      <details class="grupo-det" ${abierto ? 'open' : ''}>
        <summary>${titulo} (${items.length})</summary>
        ${sub ? conSubgrupos(items) : items.map(tarjetaEmpresa).join('')}
      </details>` : '';
    return `
      <section>
        <div class="sec-head"><h2>📅 Eventos</h2></div>
        <div class="card cabecera">
          <span class="badge rosa">FERIA · SHANGHÁI</span>
          <h2 class="titulo-serif">Automechanika Shanghai</h2>
          <p class="muted">${lista.length} empresas · ${imp.length} principales · ${lista.filter(e => e.visitado).length} stands visitados · ${lista.filter(e => estaEnPlan(principal(e))).length} en el planning</p>
          <div class="leyenda"><span class="ley niv0">Principal</span><span class="ley niv1">Secundaria alta</span><span class="ley niv2">Secundaria baja</span><span class="ley niv3">Sin prioridad</span><span class="ley comp">👁 Competidor</span></div>
        </div>
        <div class="acciones-fila">
          <button class="btn primary" data-nuevo="feria">+ Añadir empresa</button>
          <button class="btn soft" data-tab="ruta">🗺️ Ruta optimizada</button>
        </div>
        ${lista.length ? porNivel.map((l, n) => grupo(NIVELES[n].plural, l, n < 2, n === 0)).join('') : '<p class="vacio">Aún no hay empresas de la feria. Impórtalas desde Excel con el menú ⋯.</p>'}
      </section>`;
  }

  // ═══════════ Planning post feria ═══════════
  // El día de cada visita es el campo «fecha» de la ficha: si cambia, la visita pasa sola al nuevo día.
  const PLAN_INI = '2026-12-02', PLAN_FIN = '2026-12-19';
  const CONF = { pendiente: { ico: '⏳', txt: 'Pendiente de confirmar', corto: 'Pendiente' }, confirmada: { ico: '✅', txt: 'Confirmada', corto: 'Confirmada' }, no: { ico: '❌', txt: 'No puede', corto: 'No puede' } };
  const QUIENES = () => ['Juntos', ...CFG.USUARIOS];
  const ordQuien = q => ({ Juntos: 0, 'Óscar': 1, Krum: 2 })[q] ?? (q ? 3 : 4);
  const esDesg = e => tipoDe(e) === 'desguace' || !!e.esDesguace;
  const confDe = e => CONF[e.confirmacion] ? e.confirmacion : 'pendiente';
  const movidaDe = e => e.fechaPlan && e.fecha && e.fechaPlan !== e.fecha;
  const ubicPlan = e => e.lugarVisita || e.direccion || e.ciudad || (empresaFeria(e) || {}).ciudad || 'Ubicación por confirmar';
  // Entra en el planning lo marcado con «plan» y lo que tiene día entre el 2 y el 19 de diciembre con visita, prioridad o tipo visita/desguace
  function estaEnPlan(e) {
    if (!e || e.unidaA) return false;
    if (e.plan === true) return true;
    if (e.plan === false) return false;
    return !!e.fecha && e.fecha >= PLAN_INI && e.fecha <= PLAN_FIN && (!!e.visita || !!e.rango || tipoDe(e) === 'visita' || tipoDe(e) === 'desguace');
  }
  const enPlanning = () => state.empresas.filter(estaEnPlan);

  // Empresas que exponen y están en el planning: en su stand hay que cerrar la visita a la fábrica
  function avisoFabrica(e) {
    if (!e) return '';
    const p = principal(e);
    const fer = tipoDe(e) === 'feria' ? e : feriaUnida(p);
    if (!fer || !(fer.pabellon || fer.stand) || !estaEnPlan(p)) return '';
    const c = confDe(p);
    if (c === 'no') return '';
    const dia = p.fecha ? diaTxt(fechaHora(p.fecha)) : 'sin día todavía';
    if (c === 'confirmada') return `<span class="aviso-fab ok">🏭 Visita a su fábrica confirmada · ${esc(dia)}</span>`;
    if (p.dependeXie) return `<span class="aviso-fab xie">🏭 La visita a su fábrica la cierra Mr. Xie. En el stand, solo saludar · ${esc(dia)}</span>`;
    return `<span class="aviso-fab">🏭 CERRAR EN EL STAND LA VISITA A SU FÁBRICA<small>Día propuesto: ${esc(dia)}</small></span>`;
  }

  // WeChat: enlace directo (abre WeChat y añade el contacto) o móvil chino (WeChat › Añadir contacto › número)
  const tieneWx = e => !!((e.wechat || '').trim() || (e.movil || '').trim());
  function botonesWx(e) {
    const w = (e.wechat || '').trim(), mv = (e.movil || '').trim();
    if (!w && !mv) return '';
    const enlace = /^https?:\/\//i.test(w);
    return `<div class="wx-caja">
        <span class="wx-tit">💬 WeChat</span>
        ${enlace ? `<a class="btn wx" href="${esc(w)}" target="_blank" rel="noopener">Abrir en WeChat</a>` : (w ? `<button type="button" class="btn wx" data-copiar="${esc(w)}" data-msg="ID copiado. En WeChat: Añadir contacto y pégalo.">📋 Copiar ID: ${esc(w)}</button>` : '')}
        ${mv ? `<button type="button" class="btn soft" data-copiar="${esc(mv.replace(/\s/g, ''))}" data-msg="Móvil copiado. En WeChat: Añadir contacto y pégalo.">📋 Copiar móvil ${esc(mv)}</button>` : ''}
      </div>`;
  }

  function filaPlan(e, conDia) {
    const c = confDe(e);
    const antes = movidaDe(e) ? fechaHora(e.fechaPlan) : null;
    return `
      <button class="pl-item c-${c} ${esDesg(e) ? 'desg' : ''}" data-plan="${esc(e.id)}">
        <span class="pl-estado" title="${esc(CONF[c].txt)}">${CONF[c].ico}</span>
        <span class="pl-body">
          <span class="pl-top"><b>${esc(e.nombre || 'Sin nombre')}</b>${e.rango ? `<span class="badge rango r${esc(e.rango)}">${esc(e.rango)}</span>` : ''}${esDesg(e) ? '<span class="badge desg">♻️ Desguace</span>' : ''}${e.dependeXie ? '<span class="badge xie">Confirma Mr. Xie</span>' : ''}${e.separable ? '<span class="badge sep">⇄ se puede separar</span>' : ''}${tieneWx(e) ? '<span class="badge wxb">💬 WeChat</span>' : ''}</span>
          <span class="pl-loc">📍 ${zonaCorta(e) ? `<b class="zona-tag">${esc(zonaCorta(e))}</b> · ` : ''}${esc(ubicPlan(e))}</span>
          ${e.notaPlan ? `<span class="pl-nota">${esc(e.notaPlan)}</span>` : ''}
          <span class="pl-meta c-${c}">${conDia ? '📅 ' + esc(e.fecha ? diaTxt(fechaHora(e.fecha)) : 'Sin día') + ' · ' : ''}${esc(CONF[c].txt)}${e.hora ? ' · ' + esc(e.hora) : ''}${conDia && e.quien ? ' · ' + esc(e.quien) : ''}${antes ? ` · <span class="pl-movida">↪ antes, ${esc(diaTxt(antes))}</span>` : ''}</span>
        </span>
        <span class="flecha-der">›</span>
      </button>`;
  }

  function filasPorQuien(items) {
    let q = null;
    return items.map(e => {
      const k = e.quien || '';
      const cab = k !== q ? `<div class="pl-quien">${k === 'Juntos' ? '👥 Juntos' : k ? `<span class="avatar xs ${color(k)}">${esc(k[0])}</span>${esc(k)}` : 'Sin asignar'}</div>` : '';
      q = k;
      return cab + filaPlan(e);
    }).join('');
  }

  function vistaPlanning() {
    const todas = enPlanning();
    const filtro = 'todos';
    const visible = e => filtro === 'todos' || !e.quien || e.quien === 'Juntos' || e.quien === filtro;
    const activas = todas.filter(e => confDe(e) !== 'no');
    const noPueden = todas.filter(e => confDe(e) === 'no' && visible(e));
    const plan = state.viaje.planTrasFeria || {};
    const diasPlan = new Map((plan.dias || []).map(d => [d.fecha, d]));
    const fechas = [...new Set([...diasPlan.keys(), ...activas.filter(e => e.fecha).map(e => e.fecha)])].sort();
    const n = k => activas.filter(e => confDe(e) === k).length;
    const mov = activas.filter(movidaDe).length;
    const orden = (a, b) => ordQuien(a.quien) - ordQuien(b.quien) || nat(a.hora || '99', b.hora || '99') || nat(a.rango || 'Z', b.rango || 'Z') || nat(a.nombre, b.nombre);
    const seg = (v, t) => `<button class="${filtro === v ? 'on' : ''}" data-set="filtroPlan" data-val="${esc(v)}">${esc(t)}</button>`;
    const modo = state.modoPlan || 'dia';
    const segM = (v, t) => `<button class="${modo === v ? 'on' : ''}" data-set="modoPlan" data-val="${v}">${t}</button>`;
    const dia = f => {
      const d = diasPlan.get(f) || {};
      const delDia = activas.filter(e => e.fecha === f);
      const items = delDia.filter(visible).sort(orden);
      const fh = fechaHora(f);
      const conf = items.filter(e => confDe(e) === 'confirmada').length;
      return `
        <div class="card pl-dia">
          <div class="pl-cab"><b>${fh ? esc(diaTxt(fh)) : esc(f)}</b><span>${esc(d.titulo || '')}</span>${items.length ? `<span class="pl-cuenta">${items.length} ${items.length === 1 ? 'visita' : 'visitas'} · ✅ ${conf}</span>` : ''}</div>
          ${d.extra ? `<p class="pl-extra">${esc(d.extra)}</p>` : ''}
          ${items.length ? filasPorQuien(items) : (delDia.length ? `<p class="pl-vacio">Nada para ${esc(filtro)} este día.</p>` : '')}
        </div>`;
    };
    const sinDia = activas.filter(e => !e.fecha && visible(e)).sort(orden);
    const ORD_Z = ['este', 'canton', 'wuzhou', 'norte', 'pekin', 'chongqing', 'otras', 'fuera', 'sin'];
    const porZona = () => {
      const g = new Map();
      activas.filter(visible).sort((a, b) => ORD_Z.indexOf(zonaDe(a)[0]) - ORD_Z.indexOf(zonaDe(b)[0]) || nat(a.fecha || '9999', b.fecha || '9999') || nat(a.nombre, b.nombre))
        .forEach(e => { const z = zonaDe(e)[1]; if (!g.has(z)) g.set(z, []); g.get(z).push(e); });
      return [...g.entries()].map(([z, items]) => `<div class="card pl-dia"><div class="pl-cab"><b>${esc(z)}</b><span class="pl-cuenta">${items.length} ${items.length === 1 ? 'visita' : 'visitas'}</span></div>${items.map(e => filaPlan(e, true)).join('')}</div>`).join('');
    };
    return `
      <section>
        <div class="sec-head"><h2>🗓️ Planning post feria</h2></div>
        <div class="card cabecera">
          <span class="badge lila">VISITAS · 4 AL 18 DE DICIEMBRE</span>
          <h2 class="titulo-serif">Planning post feria</h2>
          <p class="muted">La única lista de visitas. Todo está pendiente hasta que cada empresa confirme el día. Pulsa una empresa para confirmarla o cambiarla de día: pasa sola al día nuevo. Para añadir una empresa, usa el botón «🗓️ Planning» de su tarjeta.</p>
          <p class="muted">${activas.length} visitas · ✅ ${n('confirmada')} confirmadas · ⏳ ${n('pendiente')} pendientes${mov ? ' · ↪ ' + mov + ' cambiadas de día' : ''}${todas.length - activas.length ? ' · ❌ ' + (todas.length - activas.length) + ' no pueden' : ''}</p>
          <div class="leyenda"><span class="ley rA">A · sí o sí</span><span class="ley rB">B · muy recomendable</span><span class="ley rC">C · si hay tiempo</span><span class="ley desg">♻️ Desguace</span><span class="ley xie">Confirma Mr. Xie</span><span class="ley sep">⇄ se puede separar</span></div>
          <p class="muted small">Vamos siempre juntos. ⇄ marca las visitas en las que, si hace falta, podemos separarnos.</p>
        </div>
        <div class="seg pl-filtro">${segM('dia', '📅 Por día')}${segM('zona', '📍 Por zona')}</div>
        <div class="acciones-fila"><button class="btn primary" data-nuevo="visita">+ Añadir otra empresa</button></div>
        ${modo === 'zona' ? porZona() : fechas.map(dia).join('')}
        ${modo !== 'zona' && sinDia.length ? `<div class="card pl-dia"><div class="pl-cab"><b>Sin día</b><span>Opciones por encajar</span></div>${filasPorQuien(sinDia)}</div>` : ''}
        ${noPueden.length ? `<details class="grupo-det"><summary>❌ No pueden (${noPueden.length})</summary><div class="card pl-dia">${noPueden.sort(orden).map(filaPlan).join('')}</div></details>` : ''}
      </section>`;
  }

  function abrirPlan(id) {
    const e = principal(empresaPorId(id));
    if (!e) return;
    const radios = (name, val, ops) => `<div class="seg pl-seg">${ops.map(([k, t]) => `<label><input type="radio" name="${name}" value="${esc(k)}" ${val === k ? 'checked' : ''}><span>${esc(t)}</span></label>`).join('')}</div>`;
    const m = abrirModal(`
      <form class="editor" id="form-plan">
        <div class="editor-head"><h2>${esc(e.nombre || 'Visita')}</h2><button type="button" class="icon-btn" data-cerrar>✕</button></div>
        ${e.nombreZh ? `<p class="zh">${esc(e.nombreZh)}</p>` : ''}
        <p class="pl-loc grande">📍 ${zonaCorta(e) ? `<b class="zona-tag">${esc(zonaCorta(e))}</b> · ` : ''}${esc(ubicPlan(e))}</p>
        ${botonesWx(e)}
        <div class="campo"><span class="lbl">¿Nos ha confirmado la visita?</span>${radios('confirmacion', confDe(e), Object.entries(CONF).map(([k, o]) => [k, o.ico + ' ' + o.corto]))}</div>
        <div class="campos">
          <label class="campo half"><span class="lbl">Día de la visita</span><input class="input" type="date" name="fecha" value="${esc(e.fecha || '')}"></label>
          <label class="campo half"><span class="lbl">Hora</span><input class="input" type="time" name="hora" value="${esc(e.hora || '')}"></label>
        </div>
        ${movidaDe(e) ? `<p class="muted small espacio">Prevista al principio el ${esc(diaTxt(fechaHora(e.fechaPlan)))}.</p>` : ''}
        <div class="campo"><span class="lbl">Quién va</span>${radios('quien', e.quien || '', QUIENES().map(q => [q, q]))}</div>
        <label class="campo check"><input type="checkbox" name="separable" ${e.separable ? 'checked' : ''}> <span>⇄ Si hace falta, aquí podemos separarnos</span></label>
        <div class="campos">
          <label class="campo"><span class="lbl">Prioridad</span><select name="rango" class="input">${[['', 'Sin asignar'], ...Object.entries(RANGOS)].map(([k, t]) => `<option value="${k}" ${(e.rango || '') === k ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
          <label class="campo"><span class="lbl">Lugar exacto (si no es la ubicación de la ficha)</span><input class="input" name="lugarVisita" value="${esc(e.lugarVisita || '')}" placeholder="${esc(e.ciudad || '')}"></label>
          <label class="campo"><span class="lbl">Nota corta</span><input class="input" name="notaPlan" value="${esc(e.notaPlan || '')}"></label>
        </div>
        <div class="pie"><button type="button" class="btn soft" data-ver-ficha>Ficha completa</button><button type="submit" class="btn primary">Guardar</button></div>
      </form>`);
    const form = m.querySelector('form');
    form.querySelector('[data-ver-ficha]').addEventListener('click', () => { cerrarModal(); abrirFicha(id); });
    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      const fd = new FormData(form);
      const g = k => String(fd.get(k) || '').trim();
      const datos = { confirmacion: g('confirmacion') || 'pendiente', fecha: g('fecha'), hora: g('hora'), quien: g('quien'), separable: fd.get('separable') === 'on', rango: g('rango'), lugarVisita: g('lugarVisita'), notaPlan: g('notaPlan'), plan: true };
      const cambioDia = (e.fecha || '') !== datos.fecha;
      if (cambioDia) { const orig = e.fechaPlan || e.fecha || ''; datos.fechaPlan = orig && orig !== datos.fecha ? orig : ''; }
      datos.visita = true;
      await parchear(rutaEmpresa(e.id), { set: datos });
      cerrarModal();
      pintar();
      toast(cambioDia && datos.fecha ? 'Pasa al ' + diaTxt(fechaHora(datos.fecha)) : (cambioDia ? 'Queda sin día' : 'Guardado'));
    });
  }

  // ═══════════ A visitar empresas (visitas a fábrica) ═══════════
  // Grandes zonas del viaje, en el orden en que las recorremos (pensado para quien no conoce la geografía china)
  const ZONAS = [
    ['wuzhou', 'Wuzhou (Guangxi), 1,5 h en tren desde Cantón', 'Wuzhou', /\b(wuzhou|guangxi)\b/],
    ['norte', 'Norte (Henan y Hebei, al sur de Pekín)', 'Norte', /\b(hebei|henan|puyang|qingfeng|cangzhou|hejian|baoding|xingtai|langfang|xianghe|anping|qinghe|julu|shijiazhuang|tangshan|handan|tianjin|hengshui)\b/],
    ['pekin', 'Pekín', 'Pekín', /\b(pekin|beijing|fengtai|chaoyang|daxing)\b/],
    ['este', 'Shanghái y alrededores', 'Shanghái', /\b(shanghai|minhang|hongqiao|zhejiang|jiangsu|anhui|taizhou|hangzhou|ningbo|wenzhou|yuhuan|jiangshan|suzhou|nanjing|changzhou|jinhua|quzhou|zhuji|wuhu|huangshan|yangzhou|zhangjiagang|suqian|xinchang|binhai|wuxi|jiaxing|shaoxing)\b/],
    ['canton', 'Cantón (Guangdong)', 'Cantón', /\b(guangdong|guangzhou|canton|foshan|shenzhen|dongguan|huadu|baiyun|panyu|yuexiu|nanhai|lishui|shishan|zhongshan|jiangmen|zhuhai)\b/],
    ['chongqing', 'Chongqing / Sichuan', 'Chongqing', /\b(chongqing|sichuan|chengdu|mianyang|nanchong|tongnan)\b|南充|绵阳/],
    ['otras', 'Otras zonas de China', 'China', /./]
  ];
  const SUBZONAS = [['baiyun', 'Baiyun'], ['huadu', 'Huadu'], ['foshan', 'Foshan'], ['nanhai', 'Foshan'], ['panyu', 'Panyu'], ['yuexiu', 'centro'], ['shenzhen', 'Shenzhen'],
    ['puyang', 'Puyang, Henan'], ['qingfeng', 'Puyang, Henan'], ['xingtai', 'Xingtai, Hebei'], ['julu', 'Julu, Hebei'], ['qinghe', 'Qinghe, Hebei'], ['hejian', 'Hejian, Hebei'],
    ['anping', 'Anping, Hebei'], ['xianghe', 'Xianghe, Hebei'], ['tianjin', 'Tianjin'], ['wuxi', 'Wuxi'], ['jiangshan', 'Jiangshan, Zhejiang'], ['taizhou', 'Taizhou']];
  const sinTildes = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  function zonaDe(e) {
    const f = tipoDe(e) === 'seleccionada' ? empresaFeria(e) : null;
    const texto = sinTildes([e.lugarVisita, e.ciudad, e.direccion, f && f.ciudad, e.nombre].filter(Boolean).join(' '));
    if (e.pais && !/china/i.test(e.pais)) return ['fuera', 'Fuera de China', 'Fuera de China'];
    if (!e.ciudad && !e.direccion && !e.lugarVisita && !(f && f.ciudad) && !ZONAS.slice(0, 6).some(z => z[3].test(texto))) return ['sin', 'Sin ciudad indicada', ''];
    const z = ZONAS.find(z => z[3].test(texto));
    return [z[0], z[1], z[2], texto];
  }
  // «Cantón · Foshan», «Norte · Hejian, Hebei»: la gran zona y, si se sabe, dónde exactamente
  function zonaCorta(e) {
    const [k, , corta, texto] = zonaDe(e);
    if (!corta) return '';
    if (k === 'pekin' || k === 'wuzhou') return corta;
    const t = texto || '';
    // la subzona que aparece antes en el texto (el lugar de la visita va primero)
    const sub = (SUBZONAS.map(([c, n]) => [t.search(new RegExp('\\b' + c + '\\b')), n]).filter(([i]) => i >= 0).sort((x, y) => x[0] - y[0])[0] || [])[1];
    if (k === 'norte' && !sub) return corta + ' · ' + (/henan/.test(t) ? 'Henan' : 'Hebei');
    if (k === 'este') return /shanghai|hongqiao|minhang/.test(t) ? 'Shanghái' : 'Este de China' + (sub ? ' · ' + sub : '');
    return sub && sub.toLowerCase() !== corta.toLowerCase() ? corta + ' · ' + sub : corta;
  }
  async function toggleVisita(id) {
    const e = principal(empresaPorId(id));
    if (!e || tipoDe(e) === 'visita') return;
    const dentro = estaEnPlan(e);
    await parchear(rutaEmpresa(e.id), { set: dentro ? { plan: false, visita: false } : { plan: true, visita: true } });
    toast(dentro ? 'Quitada del planning' : 'Añadida al planning' + (e.fecha ? '' : ', en «Sin día»'));
    pintar();
  }


  // ═══════════ Ruta optimizada de stands ═══════════
  function calcularRuta() {
    const orden = CFG.ORDEN_PABELLONES || [];
    const primerPab = p => String(p || '').split(/\s+y\s+|,|\//)[0].trim();
    const idx = p => { const i = orden.indexOf(primerPab(p)); return i < 0 ? orden.length + (primerPab(p) ? 0 : 1) : i; };
    const ordenados = feria().sort((a, b) => (idx(a.pabellon) - idx(b.pabellon)) || nat(a.pabellon, b.pabellon) || nat(a.stand, b.stand) || nat(a.nombre, b.nombre));
    // Por prioridad: las principales salen agrupadas P1…P4 (y el resto), cada grupo en orden de pabellones
    const ruta = state.modoRuta === 'importantes'
      ? [0, 1, 2, 3].flatMap(n => { const l = ordenados.filter(e => nivel(e) === n); return n === 0 ? l.sort((a, b) => ordCriterio(a) - ordCriterio(b)) : l; })
      : ordenados;
    return ruta.map((e, i) => ({ orden: i + 1, e }));
  }

  function vistaRuta() {
    const ruta = calcularRuta();
    const total = ruta.length, imp = ruta.filter(r => esImportante(r.e)).length, hechos = ruta.filter(r => r.e.visitado).length;
    const visibles = ruta.filter(r => state.filtro === 'importantes' ? esImportante(r.e) : state.filtro === 'altas' ? nivel(r.e) <= 1 : state.filtro === 'pendientes' ? !r.e.visitado : true);
    const seg = (campo, valor, txt) => `<button class="${state[campo] === valor ? 'on' : ''}" data-set="${campo}" data-val="${valor}">${txt}</button>`;
    let lista = '';
    if (!total) lista = '<p class="vacio">La ruta se crea sola con las empresas de la feria (Eventos → Automechanika Shanghai). Indica pabellón y stand de cada una.</p>';
    else if (!visibles.length) lista = '<p class="vacio">Nada que mostrar con este filtro.</p>';
    else {
      let grupoActual = null;
      lista = visibles.map(({ orden, e }) => {
        const g = state.modoRuta === 'importantes'
          ? NIVELES[nivel(e)].plural + (nivel(e) === 0 ? ' · ' + (identTxt(e) || 'otras') : '')
          : 'Pabellón ' + (pabTxt(e.pabellon) || 'sin indicar');
        const cab = g !== grupoActual ? `<h3 class="grupo">${esc(g)}</h3>` : '';
        grupoActual = g;
        return cab + `
          <div class="card parada ${claseNivel(e)} ${e.visitado ? 'hecho' : ''}">
            <button class="check" data-visitado="${esc(e.id)}" aria-label="Marcar visitado">${e.visitado ? '✓' : ''}</button>
            <button class="parada-body" data-ficha="${esc(e.id)}">
              ${badgeIdent(e)}
              <span class="emp-top"><span class="num">${orden}</span><b>${esc(e.nombre || 'Sin nombre')}</b></span>
              <span class="muted">Pab. ${esc(pabTxt(e.pabellon) || '¿?')} · Stand ${esc(e.stand || '¿?')}</span>
              ${avisoFabrica(e)}
              <span class="tags">${badgeNivel(e)}${badgeComp(principal(e))}${badgeLinea(e)}${marcasEmpresa(principal(e))}</span>
            </button>
            <div class="emp-pie">${botonVisita(e)}</div>
          </div>`;
      }).join('');
    }
    return `
      <section>
        <div class="sec-head"><h2>🗺️ Ruta optimizada</h2></div>
        <div class="card resumen-ruta">
          <div class="cifras"><div><b>${total}</b><span>stands</span></div><div><b>${imp}</b><span>principales</span></div><div><b>${hechos}</b><span>visitados</span></div></div>
          <div class="barra"><span style="width:${total ? Math.round(hechos * 100 / total) : 0}%"></span></div>
        </div>
        <div class="seg">${seg('modoRuta', 'pabellones', 'Por pabellones')}${seg('modoRuta', 'importantes', 'Por prioridad')}</div>
        <div class="chips-filtro">${seg('filtro', 'todos', 'Todos')}${seg('filtro', 'importantes', 'Principales')}${seg('filtro', 'altas', '+ Sec. alta')}${seg('filtro', 'pendientes', 'Pendientes')}</div>
        <p class="nota-info">ℹ️ El orden recorre los pabellones en secuencia para caminar lo mínimo. Los pabellones MM (MM2, MM4, MM6, MM8) están en la entreplanta, zona de piezas y componentes. Confirma pabellón y stand en el plano oficial o en la app de visitante de la feria.</p>
        ${lista}
      </section>
      <section class="card bloque">${notasHTML(VIAJE, state.viaje, 'notasRuta', '📝 Notas de la ruta')}</section>`;
  }

  // ═══════════ Resumen ═══════════
  function vistaResumen() {
    const f = feria(), v = visitas();
    const fotos = state.empresas.reduce((n, e) => n + CFG.USUARIOS.reduce((m, u) => m + (bloque(e, u).fotos || []).length, 0), 0);
    const conNotas = [...state.empresas].filter(e => CFG.USUARIOS.some(u => (bloque(e, u).texto || '').trim() || (bloque(e, u).fotos || []).length))
      .sort((a, b) => nat(a.tipo, b.tipo) || nat(a.nombre, b.nombre));
    const tile = (n, t, c) => `<div class="card kpi ${c}"><b>${n}</b><span>${t}</span></div>`;
    return `
      <section>
        <div class="sec-head"><h2>📊 Resumen</h2><span class="btns-fila"><button class="btn soft" data-accion="word">📄 Word</button><button class="btn soft" data-accion="exportar">📤 Excel</button></span></div>
        <div class="kpis">
          ${tile(f.length, 'empresas en la feria', 'azul')}
          ${tile(f.filter(esImportante).length, 'principales', 'rosa')}
          ${tile(f.filter(e => e.visitado).length + ' / ' + f.length, 'stands visitados', 'menta')}
          ${tile(seleccionadas().length, 'seleccionadas', 'azul')}
          ${tile(enPlanning().length, 'visitas en el planning', 'menta')}
          ${tile(desguaces().length, 'desguaces preseleccionados', 'menta')}
          ${tile(v.length, 'visitas a empresas', 'lila')}
          ${tile(fotos, 'fotos', 'crema')}
          ${tile(state.viaje.vuelos.length, 'vuelos', 'azul')}
        </div>
      </section>
      <section>
        <div class="sec-head"><h2>📝 Lo que hemos anotado</h2></div>
        ${conNotas.length ? conNotas.map(e => `
          <button class="card resumen-emp ${claseNivel(e)}" data-ficha="${esc(e.id)}">
            <span class="emp-top"><b>${esc(e.nombre)}</b><span class="badge ${({ visita: 'lila', seleccionada: 'azul', desguace: 'desg' })[tipoDe(e)] || NIVELES[nivel(e)].badge}">${({ visita: 'Visita', seleccionada: 'Seleccionada', desguace: 'Desguace' })[tipoDe(e)] || 'Feria'}</span></span>
            ${CFG.USUARIOS.map(u => {
              const b = bloque(e, u), n = (b.fotos || []).length, t = (b.texto || '').trim();
              if (!t && !n) return '';
              return `<span class="res-u ${color(u)}"><span class="avatar xs ${color(u)}">${esc(u[0])}</span><span>${esc(t.slice(0, 220))}${t.length > 220 ? '…' : ''}${n ? ` <span class="muted">· ${n} ${n === 1 ? 'foto' : 'fotos'}</span>` : ''}</span></span>`;
            }).join('')}
          </button>`).join('') : '<p class="vacio">Cuando escribáis notas o subáis fotos en las fichas de empresa, aparecerán aquí.</p>'}
      </section>`;
  }

  // ═══════════ Presentaciones ═══════════
  const PRESENTACIONES = [
    { id: 'video', titulo: 'Vídeo corporativo', sub: 'Lizarte · vídeo institucional en mandarín (2:19)', tipo: 'video', url: 'Presentaciones/lizarte-corporate.mp4' },
    { id: 'brochure', titulo: 'Brochure', sub: 'Catálogo corporativo Lizarte', tipo: 'enlace', url: 'brochure-liz-china.html' },
    { id: 'oem', titulo: 'OEM · TIER1', sub: 'Presentación trilingüe · ES / 中文 / EN', tipo: 'slides', carpetas: { es: 'Presentaciones/oem-tier1/oem-es', zh: 'Presentaciones/oem-tier1/oem-ch', en: 'Presentaciones/oem-tier1/oem-en' } },
    { id: 'reman', titulo: 'Reman', sub: 'Joint Venture · Refabricación EPS para China (中文)', tipo: 'enlace', url: 'Presentaciones/reman/REMAN_china-Lizarte_mandarin.pdf' },
    { id: 'div', titulo: 'Diversificación', sub: 'Carrusel trilingüe · ES / 中文 / EN', tipo: 'slides', carpetas: { es: 'Presentaciones/diversificacion/div-es', zh: 'Presentaciones/diversificacion/div-zh', en: 'Presentaciones/diversificacion/div-en' } }
  ];

  function vistaPresentaciones() {
    return `
      <section>
        <div class="sec-head"><h2>📁 Presentaciones</h2></div>
        <p class="muted espacio">Material corporativo y presentaciones por línea de negocio</p>
        ${PRESENTACIONES.map(p => `
          <button class="card fila present" data-present="${p.id}">
            <span class="fila-body"><b>${esc(p.titulo)}</b><span class="muted">${esc(p.sub)}</span></span>
            <span class="flecha-der">›</span>
          </button>`).join('')}
        <button class="btn soft ancho" data-accion="offline">⬇️ Guardar presentaciones para usarlas sin conexión</button>
        <p class="nota-info">El vídeo necesita conexión. Las diapositivas, el brochure y el PDF quedan guardados en el móvil tras pulsar el botón.</p>
      </section>`;
  }

  function slidesDe(carpeta) { return ((window.PRESENTATION_SLIDE_MANIFEST || {})[carpeta] || []).map(f => carpeta + '/' + f); }

  function abrirPresentacion(id) {
    const p = PRESENTACIONES.find(x => x.id === id);
    if (!p) return;
    if (p.tipo === 'enlace') { window.open(p.url, '_blank', 'noopener'); return; }
    if (p.tipo === 'video') {
      abrirModal(`<div class="visor"><div class="visor-head"><b>${esc(p.titulo)}</b><button class="icon-btn" data-cerrar>✕</button></div>
        <video src="${esc(p.url)}" controls playsinline preload="metadata" class="visor-video"></video></div>`, 'oscuro');
      return;
    }
    let idioma = 'es', i = 0;
    const pintarVisor = () => {
      const slides = slidesDe(p.carpetas[idioma]);
      i = Math.min(i, slides.length - 1);
      const m = document.getElementById('modal');
      m.querySelector('.sheet').innerHTML = `
        <div class="visor">
          <div class="visor-head">
            <b>${esc(p.titulo)}</b>
            <span class="idiomas">${Object.keys(p.carpetas).map(k => `<button class="${k === idioma ? 'on' : ''}" data-idioma="${k}">${{ es: 'ES', zh: '中文', en: 'EN' }[k]}</button>`).join('')}</span>
            <button class="icon-btn" data-cerrar>✕</button>
          </div>
          <div class="visor-slide"><img src="${esc(slides[i])}" alt="Diapositiva ${i + 1}"></div>
          <div class="visor-nav">
            <button class="btn" data-mover="-1" ${i === 0 ? 'disabled' : ''}>‹ Anterior</button>
            <span>${i + 1} / ${slides.length}</span>
            <button class="btn" data-mover="1" ${i >= slides.length - 1 ? 'disabled' : ''}>Siguiente ›</button>
          </div>
        </div>`;
    };
    abrirModal('', 'oscuro');
    pintarVisor();
    const m = document.getElementById('modal');
    m.addEventListener('click', e => {
      const b = e.target.closest('[data-idioma],[data-mover]');
      if (!b) return;
      if (b.dataset.idioma) { idioma = b.dataset.idioma; }
      else { const n = slidesDe(p.carpetas[idioma]).length; i = Math.max(0, Math.min(n - 1, i + Number(b.dataset.mover))); }
      pintarVisor();
    });
    let x0 = null;
    m.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
    m.addEventListener('touchend', e => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (Math.abs(dx) < 50) return;
      const n = slidesDe(p.carpetas[idioma]).length;
      i = Math.max(0, Math.min(n - 1, i + (dx < 0 ? 1 : -1)));
      pintarVisor();
    });
  }

  async function guardarOffline() {
    const urls = ['brochure-liz-china.html', 'Presentaciones/reman/REMAN_china-Lizarte_mandarin.pdf'];
    PRESENTACIONES.filter(p => p.tipo === 'slides').forEach(p => Object.values(p.carpetas).forEach(c => urls.push(...slidesDe(c))));
    let ok = 0;
    toast('Descargando ' + urls.length + ' archivos…');
    for (const u of urls) { try { const r = await fetch(u, { cache: 'reload' }); if (r.ok) ok++; } catch (e) { /* seguimos */ } }
    toast(ok === urls.length ? 'Presentaciones guardadas para usar sin conexión' : `Guardadas ${ok} de ${urls.length}. Repite con mejor conexión.`);
  }

  // ═══════════ Ventana modal ═══════════
  function abrirModal(html, clase) {
    cerrarModal(true);
    const m = document.createElement('div');
    m.id = 'modal';
    m.className = 'modal ' + (clase || '');
    m.innerHTML = `<div class="sheet">${html}</div>`;
    m.addEventListener('click', e => {
      const cp = e.target.closest('[data-copiar]');
      if (cp) { e.preventDefault(); copiarTexto(cp.dataset.copiar, cp.dataset.msg); return; }
      if (e.target === m || e.target.closest('[data-cerrar]')) cerrarModal();
    });
    document.body.appendChild(m);
    document.body.classList.add('con-modal');
    return m;
  }

  function cerrarModal(sinRepintar) {
    const m = document.getElementById('modal');
    if (!m) return;
    m.querySelectorAll('img[data-blob]').forEach(img => URL.revokeObjectURL(img.src));
    m.remove();
    document.body.classList.remove('con-modal');
    if (!sinRepintar && state.user) pintar();
  }

  // ═══════════ Formularios de vuelo y hotel ═══════════
  const ESQUEMAS = {
    vuelo: { lista: 'vuelos', titulo: 'vuelo', campos: [
      { k: 'numero', label: 'Nº de vuelo', ph: 'MU710', half: true }, { k: 'aerolinea', label: 'Aerolínea', ph: 'China Eastern', half: true },
      { k: 'fecha', label: 'Fecha de salida', type: 'date', half: true }, { k: 'hora', label: 'Hora de salida', type: 'time', half: true },
      { k: 'origen', label: 'Desde', ph: 'Madrid Barajas', half: true }, { k: 'codOrigen', label: 'Código', ph: 'MAD', half: true },
      { k: 'terminalOrigen', label: 'Terminal de salida', ph: 'T1', half: true }, { k: 'duracion', label: 'Duración', ph: '12 h 50 min', half: true },
      { k: 'llegadaFecha', label: 'Fecha de llegada', type: 'date', half: true }, { k: 'llegadaHora', label: 'Hora de llegada', type: 'time', half: true },
      { k: 'destino', label: 'Hasta', ph: 'Shanghái Pudong', half: true }, { k: 'codDestino', label: 'Código', ph: 'PVG', half: true },
      { k: 'terminalDestino', label: 'Terminal de llegada', ph: 'T1', half: true }, { k: 'clase', label: 'Clase', ph: 'Turista Premium', half: true },
      { k: 'avion', label: 'Avión', ph: 'Airbus A350-900' },
      { k: 'antelacion', label: 'Estar en el aeropuerto (horas antes)', type: 'number', ph: '3', half: true }, { k: 'cierre', label: 'Cierre facturación (min antes)', type: 'number', ph: '60', half: true }] },
    hotel: { lista: 'hoteles', titulo: 'hotel', campos: [
      { k: 'nombre', label: 'Nombre del hotel' }, { k: 'nombreZh', label: 'Nombre en chino (opcional)' }, { k: 'ciudad', label: 'Ciudad', ph: 'Shanghái' },
      { k: 'entrada', label: 'Entrada', type: 'date', half: true }, { k: 'salida', label: 'Salida', type: 'date', half: true },
      { k: 'direccion', label: 'Dirección (inglés)' }, { k: 'direccionZh', label: 'Dirección en chino (para DiDi)' }, { k: 'telefono', label: 'Teléfono', type: 'tel' }] }
  };

  const campoHTML = (c, v) => `<label class="campo ${c.half ? 'half' : ''}"><span class="lbl">${esc(c.label)}</span>
    <input class="input" type="${c.type || 'text'}" name="${c.k}" value="${esc(v[c.k] || '')}" placeholder="${esc(c.ph || '')}" ${c.ro ? 'readonly' : ''}></label>`;

  function editarViaje(tipo, id) {
    const esq = ESQUEMAS[tipo];
    const actual = id ? state.viaje[esq.lista].find(x => x.id === id) : null;
    const m = abrirModal(`
      <form class="editor" id="form-viaje">
        <div class="editor-head"><h2>${actual ? 'Editar' : 'Nuevo'} ${esq.titulo}</h2><button type="button" class="icon-btn" data-cerrar>✕</button></div>
        <div class="campos">${esq.campos.map(c => campoHTML(c, actual || {})).join('')}</div>
        <div class="pie">
          ${actual ? '<button type="button" class="btn peligro" data-borrar>Eliminar</button>' : '<span></span>'}
          <button type="submit" class="btn primary">Guardar</button>
        </div>
      </form>`);
    const form = m.querySelector('form');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(form), datos = {};
      esq.campos.forEach(c => { datos[c.k] = String(fd.get(c.k) || '').trim(); });
      const lista = state.viaje[esq.lista].map(x => x.id === id ? Object.assign({}, x, datos) : x);
      if (!actual) lista.push(Object.assign({ id: uid() }, datos));
      await parchear(VIAJE, { set: { [esq.lista]: lista } });
      cerrarModal();
    });
    const b = form.querySelector('[data-borrar]');
    if (b) b.addEventListener('click', async () => {
      if (!confirm('¿Eliminar este ' + esq.titulo + '? Desaparece para los dos.')) return;
      await parchear(VIAJE, { set: { [esq.lista]: state.viaje[esq.lista].filter(x => x.id !== id) } });
      cerrarModal();
    });
  }

  // ═══════════ Ficha de empresa (datos compartidos + bloque de cada usuario con texto y fotos) ═══════════
  // Datos de la preparación (Excel de empresas confirmadas): solo lectura
  const CRITERIOS_ABC = { A: 'Cremalleras / cajas hidráulicas', B: 'EPS', C: 'Refabrica recambios' };
  // Orden y nombre de los datos de preparación que vienen del Excel
  const CAMPOS_PREP = [['procedencia', 'Procedencia'], ['tamano', 'Tamaño según documentos'], ['observacion', 'Observación'], ['linea', 'Línea'], ['tipoEmpresa', 'Tipo'], ['grupo', 'Grupo de producto'], ['actividad', 'Actividad'], ['familia', 'Familia productos coches chinos'],
    ['filtros', 'Filtros que pasa (PT Com)'], ['criterio', 'Criterio'], ['prioridadOscar', 'Prioridad ruta Óscar'], ['motivo', 'Motivo de la priorización'],
    ['evidencia', 'Evidencia en la ficha'], ['apareceEn', 'Aparece en'], ['aviso', 'Aviso'], ['estadoUbicacion', 'Estado ubicación'], ['observaciones', 'Observaciones'], ['origen', 'Origen']];
  const CAMPOS_DESG = [['grupo', 'Grupo o matriz'], ['propiedad', 'Propiedad y alta'], ['representante', 'Representante y directivos'], ['bases', 'Plantas y filiales'],
    ['capacidad', 'Capacidad autorizada'], ['volumen', 'Volumen real'], ['refab', 'Relación con la refabricación'], ['aFavor', 'A favor'], ['enContra', 'En contra'],
    ['fiabilidad', 'Fuentes del Excel'], ['novedades', 'Búsqueda adicional (15-11-2026)'], ['fuentesNuevas', 'Fuentes de la búsqueda']];
  function prepHTML(e) {
    const p = e.prep;
    if (!p) return '';
    if (tipoDe(e) === 'desguace') {
      const fd = CAMPOS_DESG.map(([k, label]) => [label, p[k]]).filter(([, v]) => v);
      return fd.length ? `<div class="prep"><div class="prep-tit">📋 Preselección de desguaces (Excel Desguaces_China)</div>
        ${fd.map(([k, v]) => `<div class="prep-fila"><span class="lbl">${esc(k)}</span><span class="pre">${esc(v)}</span></div>`).join('')}</div>` : '';
    }
    const filas = CAMPOS_PREP.map(([k, label]) => [label, k === 'criterio' ? String(p[k] || '').replace(/\b([ABC])\b/g, (m, l) => l + ' (' + CRITERIOS_ABC[l] + ')') : p[k]])
      .filter(([, v]) => v && v !== '—');
    const titulo = tipoDe(e) === 'seleccionada' ? '📋 Documento de empresas seleccionadas' : '📋 Preparación (Excel de expositores)';
    return filas.length ? `<div class="prep"><div class="prep-tit">${titulo}</div>
      ${filas.map(([k, v]) => `<div class="prep-fila"><span class="lbl">${esc(k)}</span><span>${esc(v)}</span></div>`).join('')}</div>` : '';
  }

  function abrirFicha(id, tipoNuevo) {
    let e = id ? empresaPorId(id) : null;
    e = principal(e);                       // la ficha de feria unida abre la ficha única
    const tipo = e ? tipoDe(e) : tipoNuevo;
    const v = e || { tipo, categoria: 'principal' };
    const fer = tipo === 'feria' ? v : feriaUnida(e);   // de dónde salen los datos de feria
    const conFeria = tipo === 'feria' || !!fer;
    const comunes = [{ k: 'nombre', label: 'Nombre de la empresa' }, { k: 'nombreZh', label: 'Nombre en chino (opcional)', ph: '上海…' },
      { k: 'ciudad', label: 'Ciudad', ph: 'Shanghái', half: true }, { k: 'pais', label: 'País', half: true }];
    const contacto = [{ k: 'contacto', label: 'Persona de contacto', ph: 'Ej: Wang Li', half: true }, { k: 'rol', label: 'Rol', ph: 'Ej: Director comercial', half: true },
      { k: 'email', label: 'Email', type: 'email', half: true }, { k: 'telefono', label: 'Teléfono', type: 'tel', half: true }, { k: 'web', label: 'Web', ph: 'www…' },
      { k: 'wechat', label: 'WeChat (enlace o ID)', ph: 'https://u.wechat.com/…', half: true }, { k: 'movil', label: 'Móvil (sirve para buscarle en WeChat)', type: 'tel', ph: '139 0000 0000', half: true }];
    const opciones = (nombre, val, ops) => `<div class="seg form-seg">${ops.map(([k, t]) => `<label><input type="radio" name="${nombre}" value="${k}" ${val === k ? 'checked' : ''}><span>${t}</span></label>`).join('')}</div>`;
    const radios = (name, val, ops) => `<div class="seg pl-seg">${ops.map(([k, t]) => `<label><input type="radio" name="${name}" value="${esc(k)}" ${val === k ? 'checked' : ''}><span>${esc(t)}</span></label>`).join('')}</div>`;
    const f = fer || {};
    const enPlan = e ? estaEnPlan(e) : tipo === 'visita';

    const m = abrirModal(`
      <form class="editor ficha" id="form-ficha">
        <div class="editor-head"><h2>${e ? esc(e.nombre || 'Ficha') : (tipo === 'desguace' ? 'Nuevo desguace' : 'Nueva empresa')}</h2><button type="button" class="icon-btn" data-cerrar>✕</button></div>
        ${fer && fer.id ? badgeIdent(fer) : ''}
        ${e ? avisoFabrica(e) : ''}
        ${e ? botonesWx(principal(e)) : ''}
        <div class="campos">
          ${comunes.map(c => campoHTML(c, v)).join('')}
          ${contacto.map(c => campoHTML(c, v)).join('')}
          ${tipo === 'seleccionada' ? `<label class="campo check-campo"><input type="checkbox" name="prioritaria" ${v.prioritaria ? 'checked' : ''}><span>⭐ Prioritaria</span></label>` : ''}
        </div>
        ${conFeria ? `<div class="bloque-feria">
          <div class="prep-tit">🎪 En la feria${e && e.enFeriaDuda ? ' (posiblemente la misma empresa: comprobar en su stand)' : ''}</div>
          <div class="campos">
            ${[{ k: 'f_pabellon', label: 'Pabellón', ph: '5.1', half: true }, { k: 'f_stand', label: 'Stand', ph: 'A23', half: true }].map(c => campoHTML(c, { f_pabellon: f.pabellon, f_stand: f.stand })).join('')}
            <div class="campo"><span class="lbl">Prioridad en la feria</span>${opciones('f_categoria', NIVELES[nivel(fer || v)].k, NIVELES.map(n => [n.k, n.txt]))}</div>
            <label class="campo"><span class="lbl">Identificación (principales)</span>
              <select name="f_ident" class="input">${[['', 'Automática' + (fer && fer.id && !fer.ident && criterio(fer) >= 0 ? ': ' + identTxt(fer) : ' (según grupo de producto)')], ...IDENTS.map(c => [c.k, c.k + ' · ' + c.txt]), ['no', 'Ninguna']]
                .map(([k, t]) => `<option value="${k}" ${(f.ident || '') === k ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
            <label class="campo check-campo"><input type="checkbox" name="competidor" ${v.competidor ? 'checked' : ''}><span>👁 Competidor a vigilar</span></label>
            <label class="campo check-campo"><input type="checkbox" name="f_visitado" ${f.visitado ? 'checked' : ''}><span>Stand visitado</span></label>
          </div>
        </div>` : ''}
        <div class="bloque-visita">
          <div class="prep-tit">🗓️ Visita después de la feria</div>
          ${tipo !== 'visita' ? `<label class="campo check-campo"><input type="checkbox" name="plan" ${enPlan ? 'checked' : ''}><span>En el Planning post feria</span></label>` : ''}
          <div class="campos">
            ${[{ k: 'fecha', label: 'Día', type: 'date', half: true }, { k: 'hora', label: 'Hora', type: 'time', half: true }].map(c => campoHTML(c, v)).join('')}
            <div class="campo"><span class="lbl">¿Nos ha confirmado la visita?</span>${radios('confirmacion', confDe(v), Object.entries(CONF).map(([k, o]) => [k, o.ico + ' ' + o.corto]))}</div>
            <div class="campo"><span class="lbl">Quién va</span>${radios('quien', v.quien || '', QUIENES().map(q => [q, q]))}</div>
            <label class="campo"><span class="lbl">Prioridad de la visita</span>
              <select name="rango" class="input">${[['', 'Sin asignar'], ...Object.entries(RANGOS)].map(([k, t]) => `<option value="${k}" ${(v.rango || '') === k ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
            ${campoHTML({ k: 'lugarVisita', label: 'Dirección o lugar de la visita', ph: v.ciudad || '' }, { lugarVisita: v.lugarVisita || v.direccion || '' })}
            ${campoHTML({ k: 'notaPlan', label: 'Nota corta' }, v)}
            <label class="campo check-campo"><input type="checkbox" name="visitaHecha" ${v.visitaHecha ? 'checked' : ''}><span>Visita hecha</span></label>
          </div>
          ${movidaDe(v) ? `<p class="muted small">Prevista al principio el ${esc(diaTxt(fechaHora(v.fechaPlan)))}.</p>` : ''}
        </div>
        ${prepHTML(v)}
        ${fer && fer.id && fer !== v ? prepHTML(fer) : ''}
        ${e ? CFG.USUARIOS.map(u => bloqueUsuarioHTML(e, u)).join('') : '<p class="nota-info">Guarda la ficha para poder escribir notas y subir fotos.</p>'}
        <div class="pie">
          ${e ? '<button type="button" class="btn peligro" data-borrar>Eliminar ficha</button>' : '<span></span>'}
          <button type="submit" class="btn primary">Guardar</button>
        </div>
      </form>`);

    if (e) cargarMiniaturas(m);

    const form = m.querySelector('form');
    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      const fd = new FormData(form);
      const g = k => String(fd.get(k) || '').trim();
      const datos = { tipo };
      [...comunes, ...contacto].forEach(c => { datos[c.k] = g(c.k); });
      if (!datos.nombre) { toast('Pon al menos el nombre de la empresa'); return; }
      if (tipo === 'seleccionada') datos.prioritaria = fd.get('prioritaria') === 'on';
      const datosFeria = conFeria ? { pabellon: g('f_pabellon'), stand: g('f_stand'), categoria: fd.get('f_categoria') || 'principal', ident: g('f_ident'), visitado: fd.get('f_visitado') === 'on' } : null;
      if (conFeria) datos.competidor = fd.get('competidor') === 'on';
      if (tipo === 'feria') Object.assign(datos, datosFeria);
      const plan = tipo === 'visita' ? true : fd.get('plan') === 'on';
      Object.assign(datos, { plan, visita: plan, fecha: g('fecha'), hora: g('hora'), confirmacion: g('confirmacion') || 'pendiente', quien: g('quien'), rango: g('rango'),
        lugarVisita: g('lugarVisita'), notaPlan: g('notaPlan'), visitaHecha: fd.get('visitaHecha') === 'on' });
      if (e && (e.fecha || '') !== datos.fecha) { const orig = e.fechaPlan || e.fecha || ''; datos.fechaPlan = orig && orig !== datos.fecha ? orig : ''; }
      const nuevoId = e ? e.id : uid();
      if (!e) datos.id = nuevoId;
      await parchear(rutaEmpresa(nuevoId), { set: datos });
      if (fer && fer.id && tipo !== 'feria') await parchear(rutaEmpresa(fer.id), { set: datosFeria });   // los datos de feria siguen en su ficha
      if (e) { cerrarModal(); pintar(); toast('Ficha guardada'); }
      else { pintar(); abrirFicha(nuevoId); toast('Empresa creada. Ya puedes añadir notas y fotos.'); }
    });

    const borrar = form.querySelector('[data-borrar]');
    if (borrar) borrar.addEventListener('click', async () => {
      if (!confirm('¿Eliminar la ficha de ' + (e.nombre || 'esta empresa') + '? Se borra también para ' + CFG.USUARIOS.filter(u => u !== state.user).join(', ') + '.')) return;
      await store.borrar(rutaEmpresa(e.id));
      state.empresas = state.empresas.filter(x => x.id !== e.id);
      cerrarModal();
    });

    form.addEventListener('change', async ev => {
      const inp = ev.target.closest('input[data-subir]');
      if (!inp || !inp.files.length) return;
      await subirFotos(e.id, Array.from(inp.files));
      inp.value = '';
      refrescarBloque(e.id);
    });

    form.addEventListener('click', async ev => {
      const ap = ev.target.closest('[data-abrir-plan]');
      if (ap) { ev.preventDefault(); cerrarModal(); abrirPlan(ap.dataset.abrirPlan); return; }
      const del = ev.target.closest('[data-borrar-foto]');
      if (del) {
        ev.preventDefault();
        if (!confirm('¿Eliminar esta foto?')) return;
        const ruta = del.dataset.borrarFoto;
        const fotos = (bloque(empresaPorId(e.id)).fotos || []).filter(f => f.ruta !== ruta);
        await parchear(rutaEmpresa(e.id), { usuario: state.user, bloque: { fotos } });
        await store.borrarFoto(ruta);
        refrescarBloque(e.id);
        return;
      }
      const ef = ev.target.closest('.en-feria[data-ficha]');
      if (ef) { ev.preventDefault(); const id2 = ef.dataset.ficha; cerrarModal(true); abrirFicha(id2); return; }
      const img = ev.target.closest('img[data-foto]');
      if (img && img.src) verFoto(img.src);
    });
  }

  function bloqueUsuarioHTML(e, u) {
    const propio = u === state.user;
    const b = bloque(e, u);
    const fotos = b.fotos || [];
    return `
      <div class="bloque-u ${color(u)} ${propio ? '' : 'ajeno'}" data-bloque="${esc(u)}">
        <div class="nota-head"><span class="avatar sm ${color(u)}">${esc(u[0])}</span>${propio ? 'Tus notas y fotos' : 'Notas y fotos de ' + esc(u)}${propio ? '' : '<span class="lock">solo lectura</span>'}</div>
        <textarea data-doc="${esc(rutaEmpresa(e.id))}" data-campo="texto" rows="5" ${propio ? '' : 'readonly'}
          placeholder="${propio ? 'Qué hacen, de qué hablamos, próximos pasos…' : 'Sin notas todavía'}">${esc(b.texto || '')}</textarea>
        <div class="fotos">
          ${fotos.map(f => `<div class="foto"><img data-foto="${esc(f.ruta)}" alt="Foto">${propio ? `<button type="button" class="foto-del" data-borrar-foto="${esc(f.ruta)}" aria-label="Eliminar foto">✕</button>` : ''}</div>`).join('')}
          ${propio ? `<label class="foto-add">📷<span>Añadir fotos</span><input type="file" accept="image/*" multiple data-subir hidden></label>` : (fotos.length ? '' : '<span class="muted small">Sin fotos</span>')}
        </div>
      </div>`;
  }

  function refrescarBloque(id) {
    const m = document.getElementById('modal');
    const e = empresaPorId(id);
    if (!m || !e) return;
    const viejo = m.querySelector(`[data-bloque="${CSS.escape(state.user)}"]`);
    if (!viejo) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = bloqueUsuarioHTML(e, state.user);
    viejo.replaceWith(tmp.firstElementChild);
    cargarMiniaturas(m);
  }

  async function cargarMiniaturas(contenedor) {
    for (const img of contenedor.querySelectorAll('img[data-foto]:not([src])')) {
      const blob = await store.leerFoto(img.dataset.foto);
      if (blob) { img.src = URL.createObjectURL(blob); img.dataset.blob = '1'; }
      else img.alt = 'Foto no disponible sin conexión';
    }
  }

  async function reducirFoto(file) {
    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.src = url;
      await img.decode();
      const max = 1600, k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k);
      c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      return await new Promise(res => c.toBlob(b => res(b || file), 'image/jpeg', 0.82));
    } catch (e) { return file; }
  }

  async function subirFotos(id, archivos) {
    toast('Subiendo ' + archivos.length + (archivos.length === 1 ? ' foto…' : ' fotos…'));
    const nuevas = [];
    for (const f of archivos) {
      const blob = await reducirFoto(f);
      const ruta = 'fotos/' + id + '/' + state.user + '-' + uid() + '.jpg';
      await store.subirFoto(ruta, blob);
      nuevas.push({ ruta, fecha: new Date().toISOString() });
    }
    const actuales = bloque(empresaPorId(id)).fotos || [];
    await parchear(rutaEmpresa(id), { usuario: state.user, bloque: { fotos: actuales.concat(nuevas) } });
  }

  function verFoto(src) {
    const v = document.createElement('div');
    v.className = 'lightbox';
    v.innerHTML = `<img src="${src}" alt="Foto"><button class="icon-btn" aria-label="Cerrar">✕</button>`;
    v.addEventListener('click', () => v.remove());
    document.body.appendChild(v);
  }

  // ═══════════ Menú ═══════════
  function abrirMenu() {
    const m = abrirModal(`
      <div class="menu">
        <div class="editor-head"><h2>Opciones</h2><button class="icon-btn" data-cerrar>✕</button></div>
        <button class="menu-item" data-m="word">📄 Exportar informe a Word</button>
        <button class="menu-item" data-m="exportar">📤 Exportar todo a Excel</button>
        <label class="menu-item">📥 Importar desde Excel<input type="file" accept=".xlsx,.xls,.csv" data-m="importar" hidden></label>
        <button class="menu-item" data-m="actualizar">🔄 Actualizar app</button>
        <button class="menu-item" data-m="salir">🚪 Cerrar sesión (${esc(state.user)})</button>
        <p class="menu-info">${store.modo === 'sharepoint'
          ? 'Los datos se guardan en el SharePoint de Lizarte y se comparten entre ' + CFG.USUARIOS.join(' y ') + '.'
          : 'Por ahora los datos se guardan solo en este dispositivo. Cuando se active SharePoint, ' + CFG.USUARIOS.join(' y ') + ' compartiréis la misma información.'}
          <br>Versión ${esc(CFG.VERSION)}</p>
      </div>`);
    m.querySelector('[data-m=exportar]').addEventListener('click', () => { cerrarModal(true); exportarExcel(); });
    m.querySelector('[data-m=word]').addEventListener('click', () => { cerrarModal(true); dialogoWord(); });
    m.querySelector('[data-m=salir]').addEventListener('click', salir);
    m.querySelector('[data-m=actualizar]').addEventListener('click', async () => {
      try { const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); } catch (e) { /* nada */ }
      location.reload();
    });
    m.querySelector('[data-m=importar]').addEventListener('change', ev => {
      const f = ev.target.files[0];
      cerrarModal(true);
      if (f) importarExcel(f);
    });
  }

  // ═══════════ Clics generales ═══════════
  root.addEventListener('click', async e => {
    if (!state.user) {
      const b = e.target.closest('[data-login]');
      if (b) { loginUser = b.dataset.login; ss.set('ams26:sesion', loginUser); entrar(loginUser); }
      return;
    }
    const cp = e.target.closest('[data-copiar]');
    if (cp) { copiarTexto(cp.dataset.copiar, cp.dataset.msg); return; }
    const bv = e.target.closest('[data-visita]');
    if (bv) { toggleVisita(bv.dataset.visita); return; }
    const t = e.target.closest('[data-tab],[data-set],[data-nuevo],[data-editar],[data-plan],[data-ficha],[data-visitado],[data-present],[data-accion]');
    if (!t) return;
    const d = t.dataset;
    if (d.tab) { state.tab = d.tab; ls.set('ams26:tab', d.tab); pintar(); window.scrollTo(0, 0); }
    else if (d.set) { state[d.set] = d.val; if (d.set === 'modoRuta') ls.set('ams26:modo', d.val); if (d.set === 'modoVisitar') ls.set('ams26:modoVisitar', d.val); if (d.set === 'filtroPlan') ls.set('ams26:filtroPlan', d.val); if (d.set === 'modoPlan') ls.set('ams26:modoPlan', d.val); pintar(); }
    else if (d.nuevo) { if (d.nuevo === 'vuelo' || d.nuevo === 'hotel') editarViaje(d.nuevo); else abrirFicha(null, d.nuevo); }
    else if (d.editar) editarViaje(d.editar, d.id);
    else if (d.plan) abrirPlan(d.plan);
    else if (d.ficha) abrirFicha(d.ficha);
    else if (d.visitado) {
      const emp = empresaPorId(d.visitado);
      if (emp) { await parchear(rutaEmpresa(emp.id), { set: { visitado: !emp.visitado } }); pintar(); }
    }
    else if (d.present) abrirPresentacion(d.present);
    else if (d.accion === 'menu') abrirMenu();
    else if (d.accion === 'exportar') exportarExcel();
    else if (d.accion === 'word') dialogoWord();
    else if (d.accion === 'offline') guardarOffline();
  });

  // ═══════════ Excel ═══════════
  // ═══════════ Informe Word ═══════════
  function cargarScript(src, comprobar) {
    if (comprobar()) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = res;
      s.onerror = () => rej(new Error('No se pudo cargar ' + src + '. Comprueba la conexión.'));
      document.head.appendChild(s);
    });
  }

  const tieneContenido = e => e.visitado || CFG.USUARIOS.some(u => (bloque(e, u).texto || '').trim() || (bloque(e, u).fotos || []).length);

  function dialogoWord() {
    const todas = state.empresas.length;
    const conContenido = state.empresas.filter(tieneContenido).length;
    const m = abrirModal(`
      <form class="editor" id="form-word">
        <div class="editor-head"><h2>📄 Informe en Word</h2><button type="button" class="icon-btn" data-cerrar>✕</button></div>
        <p class="muted espacio">Portada, organización del viaje y una ficha por empresa con los datos, la preparación y las notas y fotos de ${esc(CFG.USUARIOS.join(' y '))}.</p>
        <div class="campo"><span class="lbl">Empresas</span>
          <div class="seg form-seg">
            <label><input type="radio" name="alcance" value="contenido" ${conContenido ? 'checked' : ''}><span>Con notas, fotos o visitadas (${conContenido})</span></label>
            <label><input type="radio" name="alcance" value="todas" ${conContenido ? '' : 'checked'}><span>Todas (${todas})</span></label>
          </div>
        </div>
        <label class="campo check-campo"><input type="checkbox" name="fotos" checked><span>Incluir fotos</span></label>
        ${store.modo === 'sharepoint' ? '<p class="nota-info">Además de descargarse, se guarda una copia en APP VIAJE CHINA › informes.</p>' : ''}
        <div class="pie"><span></span><button type="submit" class="btn primary">Generar informe</button></div>
      </form>`);
    m.querySelector('form').addEventListener('submit', ev => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      cerrarModal(true);
      exportarWord(fd.get('alcance') === 'todas', fd.get('fotos') === 'on');
    });
  }

  async function exportarWord(todas, incluirFotos) {
    toast('Preparando el informe…');
    try {
      await cargarScript('vendor/docx.min.js', () => !!window.docx);
      await cargarScript('word-export.js', () => !!window.generarInformeWord);
    } catch (e) { toast(e.message); return; }
    const filtro = e => todas || tieneContenido(e);
    const feriaOrden = calcularRuta().map(({ orden, e }) => Object.assign({ orden, _ident: identTxt(e), _unida: e.unidaA ? (principal(e) || {}).nombre : '' }, e)).filter(e => filtro(e) || (e._unida && filtro(principal(e))));
    const vis = visitas().filter(filtro).sort((a, b) => nat((a.fecha || '9') + (a.hora || ''), (b.fecha || '9') + (b.hora || '')) || nat(a.nombre, b.nombre));
    let ultimo = 0;
    try {
      const { blob, nombre } = await window.generarInformeWord({
        aVisitar: enPlanning().filter(e => confDe(e) !== 'no').map(e => ({ nombre: e.nombre, zona: zonaDe(e)[1], ciudad: ubicPlan(e), fecha: e.fecha, hora: e.hora,
          direccion: e.lugarVisita || e.direccion, hecha: !!e.visitaHecha, tipo: (esDesg(e) ? 'Desguace' : tipoDe(e) === 'feria' ? 'Feria · ' + NIVELES[nivel(e)].txt.replace('⭐ ', '') : origenTxt(e)) + ' · ' + CONF[confDe(e)].corto + (e.quien ? ' · ' + e.quien : '') })),
        CFG, usuario: state.user, viaje: state.viaje, feria: feriaOrden, visitas: vis, seleccionadas: seleccionadas().filter(filtro).map(e => Object.assign({}, e, { _feria: empresaFeria(e) })), desguaces: desguaces().filter(filtro), notaDesguaces: state.viaje.notaDesguaces || {}, incluirFotos, horasAeropuerto,
        leerFoto: ruta => store.leerFoto(ruta),
        progreso: (i, n) => { if (i - ultimo >= 10) { ultimo = i; toast('Preparando el informe… ' + i + ' de ' + n); } }
      });
      resultadoWord(blob, nombre);
    } catch (e) {
      console.error(e);
      toast('No se pudo generar el informe: ' + e.message);
    }
  }

  // Primero se guarda en OneDrive; después se ofrece enviar o descargar.
  // (En el móvil, descargar abre la hoja de compartir y la app deja de ejecutarse.)
  async function resultadoWord(blob, nombre) {
    let enlace = null, error = null;
    if (store.modo === 'sharepoint') {
      toast('Guardando el informe en OneDrive…');
      try { enlace = await store.guardarArchivo('informes/' + nombre, blob); }
      catch (e) { error = e.message || 'error desconocido'; }
    }
    const estado = store.modo !== 'sharepoint'
      ? '<p class="nota-info">Informe generado. Los datos están solo en este dispositivo, así que no se guarda copia en OneDrive.</p>'
      : (error
        ? `<p class="aviso-err">⚠️ No se pudo guardar en OneDrive (${esc(error)}). Comprueba la conexión y pulsa Reintentar.</p>`
        : '<p class="aviso-ok">✓ Guardado en APP VIAJE CHINA › informes. En el PC aparecerá en esa carpeta en un par de minutos.</p>');
    const puedeCompartir = (() => { try { return !!(navigator.canShare && navigator.canShare({ files: [new File([blob], nombre, { type: blob.type })] })); } catch (e) { return false; } })();
    const m = abrirModal(`
      <div class="menu">
        <div class="editor-head"><h2>📄 Informe listo</h2><button class="icon-btn" data-cerrar>✕</button></div>
        <p class="muted">${esc(nombre)}</p>
        ${estado}
        ${error ? '<button class="menu-item" data-w="reintentar">🔄 Reintentar guardar en OneDrive</button>' : ''}
        ${enlace ? `<a class="menu-item" href="${esc(enlace)}" target="_blank" rel="noopener">📂 Abrir en OneDrive</a>` : ''}
        ${puedeCompartir ? '<button class="menu-item" data-w="compartir">📤 Enviar o compartir…</button>' : ''}
        <button class="menu-item" data-w="descargar">⬇️ Descargar en este dispositivo</button>
      </div>`);
    m.addEventListener('click', async ev => {
      const b = ev.target.closest('[data-w]');
      if (!b) return;
      if (b.dataset.w === 'reintentar') { cerrarModal(true); resultadoWord(blob, nombre); }
      else if (b.dataset.w === 'compartir') {
        try { await navigator.share({ files: [new File([blob], nombre, { type: blob.type })], title: nombre }); } catch (e) { /* cancelado */ }
      } else if (b.dataset.w === 'descargar') {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = nombre;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
    });
  }

  function cargarXLSX() {
    if (window.XLSX) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'vendor/xlsx.mini.min.js';
      s.onload = res;
      s.onerror = () => rej(new Error('No se pudo cargar el módulo de Excel'));
      document.head.appendChild(s);
    });
  }
  const hoja = (cab, filas) => window.XLSX.utils.aoa_to_sheet([cab, ...filas.map(f => cab.map(h => f[h] == null ? '' : f[h]))]);

  async function exportarExcel() {
    try { await cargarXLSX(); } catch (e) { toast(e.message); return; }
    const X = window.XLSX, wb = X.utils.book_new();
    const notasDe = e => { const o = {}; CFG.USUARIOS.forEach(u => { o['Notas ' + u] = bloque(e, u).texto || ''; o['Fotos ' + u] = (bloque(e, u).fotos || []).length; }); return o; };
    const colsU = CFG.USUARIOS.flatMap(u => ['Notas ' + u, 'Fotos ' + u]);
    const vuelos = [...state.viaje.vuelos].sort((a, b) => nat((a.fecha || '') + (a.hora || ''), (b.fecha || '') + (b.hora || '')));
    X.utils.book_append_sheet(wb, hoja(['Vuelo', 'Aerolínea', 'Fecha', 'Hora', 'Origen', 'Terminal salida', 'Fecha llegada', 'Hora llegada', 'Destino', 'Terminal llegada', 'Estar en aeropuerto'],
      vuelos.map(v => { const ae = horasAeropuerto(v); return { Vuelo: v.numero, 'Aerolínea': v.aerolinea, Fecha: v.fecha, Hora: v.hora, Origen: v.origen, 'Terminal salida': v.terminalOrigen,
        'Fecha llegada': v.llegadaFecha, 'Hora llegada': v.llegadaHora, Destino: v.destino, 'Terminal llegada': v.terminalDestino, 'Estar en aeropuerto': ae ? diaTxt(ae.llegar) + ' ' + horaTxt(ae.llegar) : '' }; })), 'Vuelos');
    X.utils.book_append_sheet(wb, hoja(['Hotel', 'Ciudad', 'Entrada', 'Salida', 'Dirección', 'Dirección en chino', 'Teléfono'], state.viaje.hoteles.map(h => ({ Hotel: h.nombre, Ciudad: h.ciudad, Entrada: h.entrada, Salida: h.salida, 'Dirección': h.direccion, 'Dirección en chino': h.direccionZh, 'Teléfono': h.telefono }))), 'Hoteles');
    X.utils.book_append_sheet(wb, hoja(['Orden', 'Empresa', 'Nombre chino', 'Pabellón', 'Stand', 'Categoría', 'Identificación', 'Competidor', 'Visita tras feria', 'Día previsto', 'Línea', 'Visita', 'Visitado', 'Contacto', 'Rol', 'Web', 'Ficha única con', ...colsU],
      calcularRuta().map(({ orden, e }) => Object.assign({ Orden: orden, Empresa: e.nombre, 'Nombre chino': e.nombreZh, 'Pabellón': pabTxt(e.pabellon), Stand: e.stand,
        'Categoría': NIVELES[nivel(e)].txt.replace('⭐ ', ''), 'Identificación': identTxt(e), 'Competidor': e.competidor ? 'Sí' : '', 'Visita tras feria': principal(e).rango || '', 'Día previsto': principal(e).fecha || '', 'Línea': (e.prep || {}).linea || '', Visita: estaEnPlan(principal(e)) ? 'Planning' : '', Visitado: e.visitado ? 'Sí' : 'No', Contacto: principal(e).contacto, Rol: principal(e).rol, Web: principal(e).web, 'Ficha única con': e.unidaA ? principal(e).nombre : '' }, notasDe(principal(e))))), 'Feria');
    X.utils.book_append_sheet(wb, hoja(['Empresa', 'Nombre chino', 'Ciudad', 'Fecha', 'Hora', 'Dirección', 'Contacto', 'Rol', 'Web', 'Visitado', ...colsU],
      visitas().map(e => Object.assign({ Empresa: e.nombre, 'Nombre chino': e.nombreZh, Ciudad: e.ciudad, Fecha: e.fecha, Hora: e.hora, 'Dirección': e.direccion,
        Contacto: e.contacto, Rol: e.rol, Web: e.web, Visitado: e.visitado ? 'Sí' : 'No' }, notasDe(e)))), 'Visitas');
    X.utils.book_append_sheet(wb, hoja(['Empresa', 'Prioritaria', 'Visita', 'Ciudad', 'Procedencia', 'Tamaño', 'Observación', 'En la feria', 'Contacto', 'Email', 'Teléfono', 'Visitada', ...colsU],
      seleccionadas().map(e => { const f = empresaFeria(e), p = e.prep || {}; return Object.assign({ Empresa: e.nombre, Prioritaria: e.prioritaria ? 'Sí' : '', Visita: estaEnPlan(e) ? 'Planning' : '', Ciudad: e.ciudad,
        Procedencia: p.procedencia, 'Tamaño': p.tamano, 'Observación': p.observacion, 'En la feria': f ? 'Pab. ' + pabTxt(f.pabellon) + ' · ' + (f.stand || '') : '',
        Contacto: e.contacto, Email: e.email, 'Teléfono': e.telefono, Visitada: e.visitado ? 'Sí' : 'No' }, notasDe(e)); })), 'Seleccionadas');
    const diasP = new Map(((state.viaje.planTrasFeria || {}).dias || []).map(d => [d.fecha, d.titulo]));
    X.utils.book_append_sheet(wb, hoja(['Día', 'Zona del día', 'Empresa', 'Tipo', 'Ubicación', 'Quién va', 'Prioridad', 'Confirmación', 'Hora', 'Prevista antes', 'Nota'],
      enPlanning().sort((a, b) => nat(a.fecha || '9999', b.fecha || '9999') || ordQuien(a.quien) - ordQuien(b.quien) || nat(a.nombre, b.nombre)).map(e => ({ 'Día': e.fecha ? diaTxt(fechaHora(e.fecha)) : 'Sin día', 'Zona del día': diasP.get(e.fecha) || '',
        Empresa: e.nombre, Tipo: esDesg(e) ? 'Desguace' : (tipoDe(e) === 'feria' ? 'Feria' : origenTxt(e)), 'Ubicación': ubicPlan(e), 'Quién va': e.quien || '', Prioridad: e.rango || '', 'Confirmación': CONF[confDe(e)].txt,
        Hora: e.hora || '', 'Prevista antes': movidaDe(e) ? diaTxt(fechaHora(e.fechaPlan)) : '', Nota: e.notaPlan || '' }))), 'Planning');
    X.utils.book_append_sheet(wb, hoja(['Nº', 'Desguace', 'Nombre chino', 'Ubicación', 'Visita', 'Visita tras feria', 'Día previsto', ...CAMPOS_DESG.map(c => c[1]), 'Email', 'Teléfono', 'Web', 'Visitado', ...colsU],
      desguaces().map(e => { const p = e.prep || {}; const o = { 'Nº': p.numero || '', Desguace: e.nombre, 'Nombre chino': e.nombreZh, 'Ubicación': e.ciudad, Visita: estaEnPlan(e) ? 'Planning' : '', 'Visita tras feria': e.rango || '', 'Día previsto': e.fecha || '',
        Email: e.email, 'Teléfono': e.telefono, Web: e.web, Visitado: e.visitado ? 'Sí' : 'No' }; CAMPOS_DESG.forEach(([k, l]) => { o[l] = p[k] || ''; }); return Object.assign(o, notasDe(e)); })), 'Desguaces');
    X.utils.book_append_sheet(wb, hoja(['Usuario', 'Notas del viaje', 'Notas de la ruta'], CFG.USUARIOS.map(u => ({ Usuario: u, 'Notas del viaje': bloque(state.viaje, u).notasViaje || '', 'Notas de la ruta': bloque(state.viaje, u).notasRuta || '' }))), 'Notas');
    const h = new Date();
    X.writeFile(wb, `KKK_Automechanika Shanghai 26 ${dos(h.getDate())}-${dos(h.getMonth() + 1)}-${h.getFullYear()}.xlsx`);
  }

  function aFecha(v) {
    if (v instanceof Date && !isNaN(v)) return v.getFullYear() + '-' + dos(v.getMonth() + 1) + '-' + dos(v.getDate());
    const s = String(v || '').trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
    m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
    if (m) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
    return s;
  }
  function aHora(v) {
    if (v instanceof Date && !isNaN(v)) return dos(v.getHours()) + ':' + dos(v.getMinutes());
    if (typeof v === 'number' && v >= 0 && v < 1) { const mi = Math.round(v * 1440); return dos(Math.floor(mi / 60)) + ':' + dos(mi % 60); }
    const m = String(v || '').trim().match(/^(\d{1,2})[:.h](\d{2})/);
    return m ? m[1].padStart(2, '0') + ':' + m[2] : String(v || '').trim();
  }
  const txt = v => String(v == null ? '' : v).trim();

  // La fila de cabecera puede no ser la primera (títulos encima): se busca entre las 15 primeras
  function leerHoja(ws, mapa) {
    const filas = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
    const campoDe = cab => {
      const n = norm(cab);
      if (!n) return null;
      for (const [campo, alias] of Object.entries(mapa)) if (alias.some(a => n === a || n.startsWith(a))) return campo;
      return null;
    };
    let h = 0, mejor = 0;
    for (let i = 0; i < Math.min(15, filas.length); i++) {
      const n = filas[i].filter(c => campoDe(c)).length;
      if (n > mejor) { mejor = n; h = i; }
    }
    const campos = (filas[h] || []).map(campoDe);
    return filas.slice(h + 1).map(f => {
      const out = {};
      campos.forEach((c, j) => { if (c && out[c] === undefined) out[c] = f[j]; });
      return out;
    }).filter(o => Object.values(o).some(v => txt(v) !== ''));
  }

  const MAPA_EMPRESA = {
    numero: ['nº', 'n°'], nombreZh: ['nombre chino', 'nombre en chino', 'chino', '中文'], nombre: ['empresa', 'expositor', 'compania', 'company', 'nombre'],
    linea: ['linea'], pabellon: ['pabellon', 'hall', 'nave'], stand: ['stand', 'booth'], estadoUbicacion: ['estado ubicacion'], aviso: ['aviso'],
    prioridadOscar: ['prioridad ruta'], categoria: ['prioridad visita', 'categoria', 'prioridad', 'importancia'],
    filtros: ['filtros'], familia: ['familia'], actividad: ['actividad'], criterio: ['criterio'], evidencia: ['evidencia'], apareceEn: ['aparece en'],
    observaciones: ['observaciones', 'comentarios'], origen: ['origen'], grupo: ['grupo de producto', 'grupo'], tipoEmpresa: ['tipo (reman', 'tipo de empresa'],
    motivo: ['motivo'], pais: ['pais'], ciudad: ['ciudad'], fecha: ['fecha', 'dia'], hora: ['hora'], direccion: ['direccion'], contacto: ['contacto', 'persona'], rol: ['rol', 'cargo'],
    email: ['email', 'correo', 'e-mail'], telefono: ['telefono', 'tel'], web: ['web', 'wechat'], visitado: ['visitado'], tipo: ['tipo']
  };
  const CAMPOS_PREP_IMPORT = ['numero', 'linea', 'tipoEmpresa', 'grupo', 'actividad', 'familia', 'filtros', 'criterio', 'prioridadOscar', 'motivo', 'evidencia', 'apareceEn', 'aviso', 'estadoUbicacion', 'observaciones', 'origen'];
  // Valores de relleno del Excel que significan "sin dato"
  const limpio = v => { const t = txt(v); return /^(no (localizad|indicad|encontrad)|—|-|tba|sin nombre|pendiente$|no city)/i.test(t) ? '' : t; };
  // Prioridad del Excel a los tres niveles de la app
  function nivelDe(v) {
    const n = norm(v);
    if (!n) return '';
    if (n.startsWith('secundaria alta') || n === 'media' || n === '2') return 'alta';
    if (n.startsWith('sin prioridad')) return 'sin';
    if (n.startsWith('secundaria') || n.startsWith('menos') || n.startsWith('secundario') || n === 'baja' || n === '3' || n === 'c') return 'baja';
    return 'principal';
  }

  async function importarExcel(file) {
    try { await cargarXLSX(); } catch (e) { toast(e.message); return; }
    let wb;
    try { wb = window.XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true }); } catch (e) { toast('No se pudo leer el archivo'); return; }
    const buscar = (...nombres) => { const n = wb.SheetNames.find(s => nombres.some(x => norm(s).startsWith(x))); return n ? wb.Sheets[n] : null; };
    const wsVuelos = buscar('vuelo'), wsHoteles = buscar('hotel');
    const wsFeria = buscar('feria', 'stand', 'ruta', 'expositor', 'automechanika');
    const wsVisitas = buscar('visita');
    const wsEmpresas = buscar('empresa');
    const hojasEmp = [];
    if (wsFeria) hojasEmp.push([wsFeria, 'feria']);
    if (wsVisitas) hojasEmp.push([wsVisitas, 'visita']);
    if (wsEmpresas) hojasEmp.push([wsEmpresas, null]);
    if (!hojasEmp.length && !wsVuelos && !wsHoteles) hojasEmp.push([wb.Sheets[wb.SheetNames[0]], null]);

    const vuelos = wsVuelos ? leerHoja(wsVuelos, { fecha: ['fecha', 'dia'], hora: ['hora'], origen: ['origen', 'desde'], destino: ['destino', 'hasta'], numero: ['vuelo', 'numero', 'n vuelo'] })
      .map(v => ({ id: uid(), fecha: aFecha(v.fecha), hora: aHora(v.hora), origen: txt(v.origen), destino: txt(v.destino), numero: txt(v.numero) })) : null;
    const hoteles = wsHoteles ? leerHoja(wsHoteles, { nombre: ['hotel', 'nombre'], ciudad: ['ciudad'], entrada: ['entrada', 'check in', 'llegada'], salida: ['salida', 'check out'], direccion: ['direccion'] })
      .map(h => ({ id: uid(), nombre: txt(h.nombre), ciudad: txt(h.ciudad), entrada: aFecha(h.entrada), salida: aFecha(h.salida), direccion: txt(h.direccion) })) : null;

    const empresas = [];
    hojasEmp.forEach(([ws, tipoHoja]) => leerHoja(ws, MAPA_EMPRESA).filter(r => txt(r.nombre)).forEach(r => {
      const t = norm(r.tipo);
      const tipo = tipoHoja || (t.startsWith('visit') ? 'visita' : t ? 'feria' : (txt(r.pabellon) || txt(r.stand) ? 'feria' : (txt(r.ciudad) ? 'visita' : 'feria')));
      const cat = norm(r.categoria);
      const d = { tipo, nombre: txt(r.nombre), nombreZh: limpio(r.nombreZh), contacto: limpio(r.contacto), rol: limpio(r.rol), web: limpio(r.web),
        email: limpio(r.email), telefono: limpio(r.telefono), pais: limpio(r.pais), ciudad: limpio(r.ciudad) };
      const prep = {};
      CAMPOS_PREP_IMPORT.forEach(k => { if (r[k] !== undefined && txt(r[k])) prep[k] = txt(r[k]); });
      if (Object.keys(prep).length) d.prep = prep;
      if (tipo === 'feria') {
        d.pabellon = limpio(r.pabellon); d.stand = limpio(r.stand);
        // Sin columna de prioridad: principal si el criterio es A (cremalleras/hidráulica) o B (EPS)
        d.categoria = cat ? nivelDe(r.categoria) : (prep.criterio ? (/\b[AB]\b/.test(prep.criterio) ? 'principal' : 'baja') : '');
        if (!d.categoria && !state.empresas.some(x => norm(x.nombre) === norm(d.nombre))) d.categoria = 'principal';
      }
      else { d.fecha = aFecha(r.fecha); d.hora = aHora(r.hora); d.direccion = txt(r.direccion); }
      if (r.visitado !== undefined && txt(r.visitado)) d.visitado = ['si', 'x', 'true', '1', 'yes'].includes(norm(r.visitado));
      empresas.push(d);
    }));

    const partes = [vuelos && vuelos.length + ' vuelos', hoteles && hoteles.length + ' hoteles', empresas.length && empresas.length + ' empresas'].filter(Boolean);
    if (!partes.length) { toast('No he encontrado datos en el Excel'); return; }
    if (!confirm('Se van a cargar ' + partes.join(', ') + '.\n\nVuelos y hoteles sustituyen a los actuales. Las empresas que ya existan (mismo nombre) se actualizan y conservan sus notas y fotos. ¿Continuar?')) return;
    if (vuelos || hoteles) await parchear(VIAJE, { set: Object.assign({}, vuelos ? { vuelos } : {}, hoteles ? { hoteles } : {}) });
    for (const d of empresas) {
      const previa = state.empresas.find(x => norm(x.nombre) === norm(d.nombre) && tipoDe(x) === d.tipo);
      if (!previa) { d.id = uid(); await parchear(rutaEmpresa(d.id), { set: d }); continue; }
      // Empresa ya existente: solo se actualizan los datos que el Excel trae con valor.
      // Así no se borra lo escrito en la app (contacto, email…) ni las notas y fotos.
      const cambios = {};
      Object.keys(d).forEach(k => {
        const v = d[k];
        if (k === 'prep') cambios.prep = v; // la preparación viene siempre entera del Excel
        else if (typeof v === 'boolean' || (v != null && String(v).trim() !== '')) cambios[k] = v;
      });
      await parchear(rutaEmpresa(previa.id), { set: cambios });
    }
    if (empresas.length) state.tab = ({ visita: 'planning', seleccionada: 'seleccionadas', desguace: 'desguaces' })[empresas[0].tipo] || 'eventos';
    pintar();
    toast('Importado: ' + partes.join(', '));
  }

  // ═══════════ Sincronización periódica con SharePoint ═══════════
  async function refrescar() {
    if (!state.user || store.modo !== 'sharepoint' || document.hidden || document.getElementById('modal')) return;
    const a = document.activeElement;
    if (a && (a.tagName === 'TEXTAREA' || a.tagName === 'INPUT')) return;
    if (await store.sincronizar()) { await recargar(); pintar(); }
  }
  setInterval(refrescar, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refrescar(); });

  // ═══════════ Arranque ═══════════
  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  ls.del('ams26:sesion'); // sesiones guardadas por la versión anterior
  const sesion = ss.get('ams26:sesion');
  if (sesion && CFG.USUARIOS.includes(sesion)) entrar(sesion);
  else pintarLogin();
})();
