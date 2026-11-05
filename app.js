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
    tab: ls.get('ams26:tab') || 'general',
    sub: ls.get('ams26:sub') || 'feria',
    modoRuta: ls.get('ams26:modo') || 'pabellones',
    filtro: 'todos',
    viaje: { vuelos: [], hoteles: [], usuarios: {} },
    empresas: [],
    estado: { tipo: 'info', texto: '' }
  };

  const bloque = (doc, u) => ((doc && doc.usuarios) || {})[u || state.user] || {};
  const esImportante = e => e.categoria !== 'secundario';
  const feria = () => state.empresas.filter(e => e.tipo !== 'visita');
  const visitas = () => state.empresas.filter(e => e.tipo === 'visita');
  const empresaPorId = id => state.empresas.find(e => e.id === id);

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

  // ═══════════ Inicio de sesión (contraseña por usuario, guardada cifrada en cada dispositivo) ═══════════
  async function hashPass(u, p) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('ams26:' + u + ':' + p));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  let loginUser = null;

  function pintarLogin(error) {
    const crear = loginUser && !ls.get('ams26:pass:' + loginUser);
    root.innerHTML = `
      <div class="login">
        <div class="login-card">
          <img src="lizarte-logo.png" alt="Lizarte" class="login-logo" width="335" height="96">
          <p class="login-titulo">${esc(CFG.TITULO || '')}</p>
          <p class="login-mision">Automechanika Shanghai · 2 al 5 de diciembre de 2026</p>
          <p class="login-sub">Acceso Lizarte · ${store.modo === 'sharepoint' ? 'sincronización SharePoint' : 'datos en este dispositivo'}</p>
          <div class="login-users">
            ${CFG.USUARIOS.map(u => `<button type="button" class="login-user ${u === loginUser ? 'on' : ''}" data-login="${esc(u)}">Soy ${esc(u)}</button>`).join('')}
          </div>
          ${loginUser ? `
            <form id="loginForm" class="login-form">
              <input type="text" name="username" value="${esc(loginUser)}" autocomplete="username" hidden>
              <label class="lbl" for="pass">${crear ? `Crea la contraseña de ${esc(loginUser)} en este dispositivo` : `Contraseña de ${esc(loginUser)}`}</label>
              <input id="pass" class="input" type="password" name="pass" minlength="4" required autocomplete="${crear ? 'new-password' : 'current-password'}">
              ${crear ? '<input class="input" type="password" name="pass2" minlength="4" required placeholder="Repite la contraseña" autocomplete="new-password">' : ''}
              <button class="btn primary big" type="submit">${crear ? 'Crear y entrar' : 'Entrar'}</button>
            </form>` : '<p class="login-hint">Elige usuario</p>'}
          ${error ? `<p class="login-error">${esc(error)}</p>` : ''}
          <p class="login-version">Versión ${esc(CFG.VERSION)}</p>
        </div>
      </div>`;
    const p = document.getElementById('pass');
    if (p) p.focus();
  }

  root.addEventListener('submit', async e => {
    if (e.target.id !== 'loginForm') return;
    e.preventDefault();
    const f = new FormData(e.target);
    const pass = String(f.get('pass') || '');
    const clave = 'ams26:pass:' + loginUser;
    if (!ls.get(clave)) {
      if (pass !== f.get('pass2')) return pintarLogin('Las contraseñas no coinciden.');
      ls.set(clave, await hashPass(loginUser, pass));
    } else if (ls.get(clave) !== await hashPass(loginUser, pass)) {
      return pintarLogin('Contraseña incorrecta.');
    }
    ss.set('ams26:sesion', loginUser);
    entrar(loginUser);
  });

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
    ['ruta', '🗺️', 'Ruta stands'],
    ['resumen', '📊', 'Resumen'],
    ['presentaciones', '📁', 'Presentaciones']
  ];

  function pintar() {
    const y = window.scrollY;
    const vistas = { general: vistaGeneral, eventos: vistaEventos, ruta: vistaRuta, resumen: vistaResumen, presentaciones: vistaPresentaciones };
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
        ${vuelos.length ? vuelos.map(v => `
          <button class="card fila vuelo" data-editar="vuelo" data-id="${esc(v.id)}">
            <span class="hora">${esc(v.hora || '··:··')}</span>
            <span class="fila-body">
              <b>${esc(v.origen || '¿?')} → ${esc(v.destino || '¿?')}</b>
              <span class="muted">${esc(fechaCorta(v.fecha))}${v.numero ? ' · ' + esc(v.numero) : ''}</span>
            </span>
          </button>`).join('') : '<p class="vacio">Todavía no hay vuelos. Añade el primero.</p>'}
      </section>

      <section>
        <div class="sec-head"><h2>🏨 Hoteles</h2><button class="btn soft" data-nuevo="hotel">+ Añadir</button></div>
        ${hoteles.length ? hoteles.map(h => `
          <button class="card fila" data-editar="hotel" data-id="${esc(h.id)}">
            <span class="fila-body">
              <b>${esc(h.nombre || 'Hotel')}</b>
              <span class="muted">${esc(h.ciudad || '')}${h.entrada ? ' · Entrada ' + esc(fechaCorta(h.entrada)) : ''}${h.salida ? ', salida ' + esc(fechaCorta(h.salida)) : ''}</span>
              ${h.direccion ? `<span class="muted small">${esc(h.direccion)}</span>` : ''}
            </span>
          </button>`).join('') : '<p class="vacio">Todavía no hay hoteles.</p>'}
      </section>

      <section class="card bloque">${notasHTML(VIAJE, state.viaje, 'notasViaje', '📝 Notas del viaje')}</section>`;
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
    const linea = e.tipo === 'visita'
      ? [e.ciudad, e.fecha ? fechaCorta(e.fecha) : '', e.hora].filter(Boolean).map(esc).join(' · ')
      : 'Pab. ' + esc(e.pabellon || '¿?') + ' · Stand ' + esc(e.stand || '¿?');
    const resumen = CFG.USUARIOS.map(u => bloque(e, u).texto).find(t => (t || '').trim()) || '';
    return `
      <button class="card empresa ${e.tipo !== 'visita' && esImportante(e) ? 'imp' : ''}" data-ficha="${esc(e.id)}">
        <span class="emp-top"><b>${esc(e.nombre || 'Sin nombre')}</b>${e.visitado ? '<span class="badge menta">✓ Visitado</span>' : ''}</span>
        ${e.nombreZh ? `<span class="zh">${esc(e.nombreZh)}</span>` : ''}
        <span class="muted">${linea}</span>
        ${e.contacto ? `<span class="muted small">👤 ${esc(e.contacto)}${e.rol ? ' · ' + esc(e.rol) : ''}</span>` : ''}
        ${e.ciudad && e.tipo !== 'visita' ? `<span class="muted small">📍 ${esc(e.ciudad)}${e.pais && e.pais !== 'China' ? ', ' + esc(e.pais) : ''}</span>` : ''}
        ${resumen ? `<span class="extracto">${esc(resumen.slice(0, 140))}${resumen.length > 140 ? '…' : ''}</span>` : ''}
        <span class="tags">${e.tipo !== 'visita' ? `<span class="badge ${esImportante(e) ? 'rosa' : 'crema'}">${esImportante(e) ? '⭐ Importante' : 'Menos importante'}</span>` : '<span class="badge lila">🏢 Visita</span>'}${e.prep && e.prep.criterio ? `<span class="badge azul">Criterio ${esc(e.prep.criterio)}</span>` : ''}${marcasEmpresa(e)}</span>
      </button>`;
  }

  function vistaEventos() {
    const chip = (id, txt) => `<button class="chip-tab ${state.sub === id ? 'on' : ''}" data-sub="${id}">${txt}</button>`;
    let cuerpo;
    if (state.sub === 'visita') {
      const lista = visitas().sort((a, b) => nat((a.fecha || '9') + (a.hora || ''), (b.fecha || '9') + (b.hora || '')) || nat(a.nombre, b.nombre));
      cuerpo = `
        <div class="card cabecera">
          <span class="badge lila">VISITAS · CHINA</span>
          <h2 class="titulo-serif">Visita a empresas</h2>
          <p class="muted">${lista.length} ${lista.length === 1 ? 'empresa' : 'empresas'} · fuera de la feria</p>
        </div>
        <div class="acciones-fila"><button class="btn primary" data-nuevo="visita">+ Añadir empresa</button></div>
        ${lista.length ? lista.map(tarjetaEmpresa).join('') : '<p class="vacio">Aún no hay visitas. Pásame la lista y las cargo, o añádelas aquí.</p>'}`;
    } else {
      const lista = feria().sort((a, b) => nat(a.nombre, b.nombre));
      const imp = lista.filter(esImportante), sec = lista.filter(e => !esImportante(e));
      const grupo = (titulo, items, abierto) => items.length ? `
        <details class="grupo-det" ${abierto ? 'open' : ''}>
          <summary>${titulo} (${items.length})</summary>
          ${items.map(tarjetaEmpresa).join('')}
        </details>` : '';
      cuerpo = `
        <div class="card cabecera">
          <span class="badge rosa">FERIA · SHANGHÁI</span>
          <h2 class="titulo-serif">Automechanika Shanghai</h2>
          <p class="muted">${lista.length} empresas · ${imp.length} importantes · ${lista.filter(e => e.visitado).length} visitadas</p>
        </div>
        <div class="acciones-fila">
          <button class="btn primary" data-nuevo="feria">+ Añadir empresa</button>
          <button class="btn soft" data-tab="ruta">🗺️ Ver ruta</button>
        </div>
        ${lista.length ? grupo('⭐ Importantes', imp, true) + grupo('Menos importantes', sec, true) : '<p class="vacio">Aún no hay empresas de la feria. Pásame la lista y las cargo, o impórtalas desde Excel con el menú ⋯.</p>'}`;
    }
    return `
      <section>
        <div class="sec-head"><h2>📅 Eventos</h2></div>
        <div class="chip-tabs">${chip('feria', '🏭 Automechanika Shanghai')}${chip('visita', '🏢 Visita a empresas')}</div>
        ${cuerpo}
      </section>`;
  }

  // ═══════════ Ruta optimizada de stands ═══════════
  function calcularRuta() {
    const orden = CFG.ORDEN_PABELLONES || [];
    const idx = p => { const i = orden.indexOf(String(p || '').trim()); return i < 0 ? orden.length : i; };
    const ordenados = feria().sort((a, b) => (idx(a.pabellon) - idx(b.pabellon)) || nat(a.pabellon, b.pabellon) || nat(a.stand, b.stand) || nat(a.nombre, b.nombre));
    const ruta = state.modoRuta === 'importantes' ? [...ordenados.filter(esImportante), ...ordenados.filter(e => !esImportante(e))] : ordenados;
    return ruta.map((e, i) => ({ orden: i + 1, e }));
  }

  function vistaRuta() {
    const ruta = calcularRuta();
    const total = ruta.length, imp = ruta.filter(r => esImportante(r.e)).length, hechos = ruta.filter(r => r.e.visitado).length;
    const visibles = ruta.filter(r => state.filtro === 'importantes' ? esImportante(r.e) : state.filtro === 'pendientes' ? !r.e.visitado : true);
    const seg = (campo, valor, txt) => `<button class="${state[campo] === valor ? 'on' : ''}" data-set="${campo}" data-val="${valor}">${txt}</button>`;
    let lista = '';
    if (!total) lista = '<p class="vacio">La ruta se crea sola con las empresas de la feria (Eventos → Automechanika Shanghai). Indica pabellón y stand de cada una.</p>';
    else if (!visibles.length) lista = '<p class="vacio">Nada que mostrar con este filtro.</p>';
    else {
      let grupoActual = null;
      lista = visibles.map(({ orden, e }) => {
        const g = state.modoRuta === 'importantes' ? (esImportante(e) ? '⭐ Importantes' : 'Menos importantes') : 'Pabellón ' + (e.pabellon || 'sin indicar');
        const cab = g !== grupoActual ? `<h3 class="grupo">${esc(g)}</h3>` : '';
        grupoActual = g;
        return cab + `
          <div class="card parada ${esImportante(e) ? 'imp' : ''} ${e.visitado ? 'hecho' : ''}">
            <button class="check" data-visitado="${esc(e.id)}" aria-label="Marcar visitado">${e.visitado ? '✓' : ''}</button>
            <button class="parada-body" data-ficha="${esc(e.id)}">
              <span class="emp-top"><span class="num">${orden}</span><b>${esc(e.nombre || 'Sin nombre')}</b></span>
              <span class="muted">Pab. ${esc(e.pabellon || '¿?')} · Stand ${esc(e.stand || '¿?')}</span>
              <span class="tags"><span class="badge ${esImportante(e) ? 'rosa' : 'crema'}">${esImportante(e) ? '⭐ Importante' : 'Menos importante'}</span>${marcasEmpresa(e)}</span>
            </button>
          </div>`;
      }).join('');
    }
    return `
      <section>
        <div class="sec-head"><h2>🗺️ Ruta por la feria</h2></div>
        <div class="card resumen-ruta">
          <div class="cifras"><div><b>${total}</b><span>stands</span></div><div><b>${imp}</b><span>importantes</span></div><div><b>${hechos}</b><span>visitados</span></div></div>
          <div class="barra"><span style="width:${total ? Math.round(hechos * 100 / total) : 0}%"></span></div>
        </div>
        <div class="seg">${seg('modoRuta', 'pabellones', 'Por pabellones')}${seg('modoRuta', 'importantes', 'Importantes primero')}</div>
        <div class="chips-filtro">${seg('filtro', 'todos', 'Todos')}${seg('filtro', 'importantes', 'Solo importantes')}${seg('filtro', 'pendientes', 'Pendientes')}</div>
        <p class="nota-info">ℹ️ El orden recorre los pabellones en secuencia para caminar lo mínimo. Confirma pabellón y stand en el plano oficial o en la app de visitante de la feria.</p>
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
        <div class="sec-head"><h2>📊 Resumen</h2><button class="btn soft" data-accion="exportar">📤 Excel</button></div>
        <div class="kpis">
          ${tile(f.length, 'empresas en la feria', 'azul')}
          ${tile(f.filter(esImportante).length, 'importantes', 'rosa')}
          ${tile(f.filter(e => e.visitado).length + ' / ' + f.length, 'stands visitados', 'menta')}
          ${tile(v.length, 'visitas a empresas', 'lila')}
          ${tile(fotos, 'fotos', 'crema')}
          ${tile(state.viaje.vuelos.length, 'vuelos', 'azul')}
        </div>
      </section>
      <section>
        <div class="sec-head"><h2>📝 Lo que hemos anotado</h2></div>
        ${conNotas.length ? conNotas.map(e => `
          <button class="card resumen-emp" data-ficha="${esc(e.id)}">
            <span class="emp-top"><b>${esc(e.nombre)}</b><span class="badge ${e.tipo === 'visita' ? 'lila' : (esImportante(e) ? 'rosa' : 'crema')}">${e.tipo === 'visita' ? 'Visita' : 'Feria'}</span></span>
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
    m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-cerrar]')) cerrarModal(); });
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
      { k: 'fecha', label: 'Fecha', type: 'date', half: true }, { k: 'hora', label: 'Hora de salida', type: 'time', half: true },
      { k: 'origen', label: 'Desde', ph: 'Madrid', half: true }, { k: 'destino', label: 'Hasta', ph: 'Shanghái Pudong', half: true },
      { k: 'numero', label: 'Nº de vuelo', ph: 'CA 908' }] },
    hotel: { lista: 'hoteles', titulo: 'hotel', campos: [
      { k: 'nombre', label: 'Nombre del hotel' }, { k: 'ciudad', label: 'Ciudad', ph: 'Shanghái' },
      { k: 'entrada', label: 'Entrada', type: 'date', half: true }, { k: 'salida', label: 'Salida', type: 'date', half: true },
      { k: 'direccion', label: 'Dirección' }] }
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
  const CRITERIOS = { A: 'Cremalleras / cajas hidráulicas', B: 'EPS', C: 'Refabrica recambios' };
  function prepHTML(e) {
    const p = e.prep;
    if (!p) return '';
    const crit = (p.criterio || '').replace(/\b([ABC])\b/g, (m, l) => l + ' (' + CRITERIOS[l] + ')');
    const filas = [['Criterio', crit], ['Evidencia en la ficha', p.evidencia], ['Aparece en', p.apareceEn], ['Prioridad ruta Óscar', p.prioridadOscar], ['Observaciones', p.observaciones]]
      .filter(([, v]) => v && v !== '—');
    return filas.length ? `<div class="prep"><div class="prep-tit">📋 Preparación (fichero KKK y OH)</div>
      ${filas.map(([k, v]) => `<div class="prep-fila"><span class="lbl">${esc(k)}</span><span>${esc(v)}</span></div>`).join('')}</div>` : '';
  }

  function abrirFicha(id, tipoNuevo) {
    const e = id ? empresaPorId(id) : null;
    const tipo = e ? (e.tipo === 'visita' ? 'visita' : 'feria') : tipoNuevo;
    const v = e || { tipo, categoria: 'importante' };
    const comunes = [{ k: 'nombre', label: 'Nombre de la empresa' }, { k: 'nombreZh', label: 'Nombre en chino (opcional)', ph: '上海…' }];
    const propios = tipo === 'feria'
      ? [{ k: 'pabellon', label: 'Pabellón', ph: '5.1', half: true }, { k: 'stand', label: 'Stand', ph: 'A23', half: true }]
      : [{ k: 'ciudad', label: 'Ciudad', ph: 'Shanghái' }, { k: 'fecha', label: 'Fecha', type: 'date', half: true }, { k: 'hora', label: 'Hora', type: 'time', half: true }, { k: 'direccion', label: 'Dirección' }];
    const contacto = [{ k: 'contacto', label: 'Persona de contacto', ph: 'Ej: Wang Li', half: true }, { k: 'rol', label: 'Rol', ph: 'Ej: Director comercial', half: true },
      { k: 'email', label: 'Email', type: 'email', half: true }, { k: 'telefono', label: 'Teléfono', type: 'tel', half: true }, { k: 'web', label: 'Web o WeChat', ph: 'www…' }];
    if (tipo === 'feria') propios.push({ k: 'ciudad', label: 'Ciudad', half: true }, { k: 'pais', label: 'País', half: true });
    const opciones = (nombre, val, ops) => `<div class="seg form-seg">${ops.map(([k, t]) => `<label><input type="radio" name="${nombre}" value="${k}" ${val === k ? 'checked' : ''}><span>${t}</span></label>`).join('')}</div>`;

    const m = abrirModal(`
      <form class="editor ficha" id="form-ficha">
        <div class="editor-head"><h2>${e ? esc(e.nombre || 'Ficha') : 'Nueva empresa'}</h2><button type="button" class="icon-btn" data-cerrar>✕</button></div>
        <div class="campos">
          ${comunes.map(c => campoHTML(c, v)).join('')}
          ${propios.map(c => campoHTML(c, v)).join('')}
          ${tipo === 'feria' ? `<div class="campo"><span class="lbl">Categoría</span>${opciones('categoria', esImportante(v) ? 'importante' : 'secundario', [['importante', '⭐ Importante'], ['secundario', 'Menos importante']])}</div>` : ''}
          ${contacto.map(c => campoHTML(c, v)).join('')}
          <label class="campo check-campo"><input type="checkbox" name="visitado" ${v.visitado ? 'checked' : ''}><span>Ya visitada</span></label>
        </div>
        ${prepHTML(v)}
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
      const datos = { tipo };
      [...comunes, ...propios, ...contacto].forEach(c => { datos[c.k] = String(fd.get(c.k) || '').trim(); });
      if (!datos.nombre) { toast('Pon al menos el nombre de la empresa'); return; }
      if (tipo === 'feria') datos.categoria = fd.get('categoria') || 'importante';
      datos.visitado = fd.get('visitado') === 'on';
      const nuevoId = e ? e.id : uid();
      if (!e) datos.id = nuevoId;
      await parchear(rutaEmpresa(nuevoId), { set: datos });
      if (e) { cerrarModal(); toast('Ficha guardada'); }
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
      if (b) { loginUser = b.dataset.login; pintarLogin(); }
      return;
    }
    const t = e.target.closest('[data-tab],[data-sub],[data-set],[data-nuevo],[data-editar],[data-ficha],[data-visitado],[data-present],[data-accion]');
    if (!t) return;
    const d = t.dataset;
    if (d.tab) { state.tab = d.tab; ls.set('ams26:tab', d.tab); pintar(); window.scrollTo(0, 0); }
    else if (d.sub) { state.sub = d.sub; ls.set('ams26:sub', d.sub); pintar(); }
    else if (d.set) { state[d.set] = d.val; if (d.set === 'modoRuta') ls.set('ams26:modo', d.val); pintar(); }
    else if (d.nuevo) { if (d.nuevo === 'vuelo' || d.nuevo === 'hotel') editarViaje(d.nuevo); else abrirFicha(null, d.nuevo); }
    else if (d.editar) editarViaje(d.editar, d.id);
    else if (d.ficha) abrirFicha(d.ficha);
    else if (d.visitado) {
      const emp = empresaPorId(d.visitado);
      if (emp) { await parchear(rutaEmpresa(emp.id), { set: { visitado: !emp.visitado } }); pintar(); }
    }
    else if (d.present) abrirPresentacion(d.present);
    else if (d.accion === 'menu') abrirMenu();
    else if (d.accion === 'exportar') exportarExcel();
    else if (d.accion === 'offline') guardarOffline();
  });

  // ═══════════ Excel ═══════════
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
    X.utils.book_append_sheet(wb, hoja(['Fecha', 'Hora', 'Origen', 'Destino', 'Vuelo'], vuelos.map(v => ({ Fecha: v.fecha, Hora: v.hora, Origen: v.origen, Destino: v.destino, Vuelo: v.numero }))), 'Vuelos');
    X.utils.book_append_sheet(wb, hoja(['Hotel', 'Ciudad', 'Entrada', 'Salida', 'Dirección'], state.viaje.hoteles.map(h => ({ Hotel: h.nombre, Ciudad: h.ciudad, Entrada: h.entrada, Salida: h.salida, 'Dirección': h.direccion }))), 'Hoteles');
    X.utils.book_append_sheet(wb, hoja(['Orden', 'Empresa', 'Nombre chino', 'Pabellón', 'Stand', 'Categoría', 'Visitado', 'Contacto', 'Rol', 'Web', ...colsU],
      calcularRuta().map(({ orden, e }) => Object.assign({ Orden: orden, Empresa: e.nombre, 'Nombre chino': e.nombreZh, 'Pabellón': e.pabellon, Stand: e.stand,
        'Categoría': esImportante(e) ? 'Importante' : 'Menos importante', Visitado: e.visitado ? 'Sí' : 'No', Contacto: e.contacto, Rol: e.rol, Web: e.web }, notasDe(e)))), 'Feria');
    X.utils.book_append_sheet(wb, hoja(['Empresa', 'Nombre chino', 'Ciudad', 'Fecha', 'Hora', 'Dirección', 'Contacto', 'Rol', 'Web', 'Visitado', ...colsU],
      visitas().map(e => Object.assign({ Empresa: e.nombre, 'Nombre chino': e.nombreZh, Ciudad: e.ciudad, Fecha: e.fecha, Hora: e.hora, 'Dirección': e.direccion,
        Contacto: e.contacto, Rol: e.rol, Web: e.web, Visitado: e.visitado ? 'Sí' : 'No' }, notasDe(e)))), 'Visitas');
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
    nombreZh: ['nombre chino', 'nombre en chino', 'chino', '中文'], nombre: ['empresa', 'expositor', 'compania', 'company', 'nombre'],
    pabellon: ['pabellon', 'hall', 'nave'], stand: ['stand', 'booth'], prioridadOscar: ['prioridad ruta'], categoria: ['categoria', 'prioridad', 'importancia'],
    criterio: ['criterio'], evidencia: ['evidencia'], apareceEn: ['aparece en'], observaciones: ['observaciones', 'comentarios'],
    pais: ['pais'], ciudad: ['ciudad'], fecha: ['fecha', 'dia'], hora: ['hora'], direccion: ['direccion'], contacto: ['contacto', 'persona'], rol: ['rol', 'cargo'],
    email: ['email', 'correo', 'e-mail'], telefono: ['telefono', 'tel'], web: ['web', 'wechat'], visitado: ['visitado'], tipo: ['tipo']
  };

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
      const d = { tipo, nombre: txt(r.nombre), nombreZh: txt(r.nombreZh), contacto: txt(r.contacto), rol: txt(r.rol), web: txt(r.web),
        email: txt(r.email), telefono: txt(r.telefono), pais: txt(r.pais), ciudad: txt(r.ciudad) };
      const prep = { criterio: txt(r.criterio), evidencia: txt(r.evidencia), apareceEn: txt(r.apareceEn), prioridadOscar: txt(r.prioridadOscar), observaciones: txt(r.observaciones) };
      if (Object.values(prep).some(Boolean)) d.prep = prep;
      if (tipo === 'feria') {
        d.pabellon = txt(r.pabellon); d.stand = txt(r.stand);
        // Sin columna de categoría: importante si el criterio es A (cremalleras/hidráulica) o B (EPS)
        d.categoria = cat ? ((cat.startsWith('menos') || cat.startsWith('secund') || cat === 'baja' || cat === 'b' || cat === '2') ? 'secundario' : 'importante')
          : (prep.criterio ? (/\b[AB]\b/.test(prep.criterio) ? 'importante' : 'secundario') : 'importante');
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
      const previa = state.empresas.find(x => norm(x.nombre) === norm(d.nombre) && (x.tipo === 'visita') === (d.tipo === 'visita'));
      const id = previa ? previa.id : uid();
      if (!previa) d.id = id;
      await parchear(rutaEmpresa(id), { set: d });
    }
    if (empresas.length) { state.tab = 'eventos'; state.sub = empresas[0].tipo; }
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
  if (sesion && CFG.USUARIOS.includes(sesion) && ls.get('ams26:pass:' + sesion)) entrar(sesion);
  else pintarLogin();
})();
