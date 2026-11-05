/* Capa de guardado · Automechanika Shanghai 26
 *
 * La app trabaja con "documentos" JSON (viaje.json, empresas/<id>.json) y fotos.
 * Cada documento tiene campos compartidos y un bloque por usuario:
 *   { ...compartidos, usuarios: { Krum: {...}, Scrum: {...} } }
 * Cada usuario solo escribe en su bloque; el del otro se lee.
 *
 * Dos modos con las mismas funciones:
 *   · Móvil: todo en IndexedDB del propio dispositivo.
 *   · SharePoint: archivos en la carpeta configurada del sitio de Lizarte (Microsoft Graph).
 *     Se guarda copia en el móvil para funcionar sin conexión y los cambios
 *     pendientes se envían en cuanto vuelve la cobertura.
 */
(function () {
  'use strict';

  // ---------- IndexedDB (con respaldo en memoria si el navegador no lo permite) ----------
  const memoria = { docs: new Map(), fotos: new Map(), cola: new Map(), meta: new Map() };
  let dbPromise = null;

  function abrirDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(resolve => {
      try {
        const req = indexedDB.open('ams26', 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          ['docs', 'fotos', 'cola', 'meta'].forEach(n => { if (!db.objectStoreNames.contains(n)) db.createObjectStore(n); });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
    });
    return dbPromise;
  }

  async function op(almacen, modo, fn) {
    const db = await abrirDB();
    if (!db) return fn(null, memoria[almacen]);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(almacen, modo);
      const req = fn(tx.objectStore(almacen), null);
      let resultado;
      if (req) req.onsuccess = () => { resultado = req.result; };
      tx.oncomplete = () => resolve(resultado);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
  const idb = {
    get: (a, k) => op(a, 'readonly', (s, m) => m ? m.get(k) : s.get(k)),
    put: (a, k, v) => op(a, 'readwrite', (s, m) => m ? void m.set(k, v) : s.put(v, k)),
    del: (a, k) => op(a, 'readwrite', (s, m) => m ? void m.delete(k) : s.delete(k)),
    keys: a => op(a, 'readonly', (s, m) => m ? Array.from(m.keys()) : s.getAllKeys())
  };

  // ---------- Parches: la única forma de modificar un documento ----------
  // { set: {campos compartidos}, usuario: 'Krum', bloque: {campos del usuario} }
  function aplicarParche(doc, p) {
    const d = (doc && typeof doc === 'object') ? JSON.parse(JSON.stringify(doc)) : {};
    if (p.set) Object.assign(d, p.set);
    if (p.usuario && p.bloque) {
      d.usuarios = d.usuarios || {};
      d.usuarios[p.usuario] = Object.assign({}, d.usuarios[p.usuario] || {}, p.bloque);
    }
    d.actualizado = new Date().toISOString();
    return d;
  }

  let contador = 0;
  const claveCola = () => String(Date.now()).padStart(15, '0') + '-' + String(contador++).padStart(4, '0');

  // ---------- Modo móvil ----------
  function StoreMovil() {
    let estado = () => {};
    const aviso = () => estado({ tipo: 'local', texto: 'Guardado en este móvil' });
    return {
      modo: 'movil',
      onEstado(fn) { estado = fn; },
      async iniciar() { aviso(); },
      async leer(ruta) { return (await idb.get('docs', ruta)) || null; },
      async listar(prefijo) {
        const claves = (await idb.keys('docs')).filter(k => String(k).startsWith(prefijo));
        const docs = [];
        for (const k of claves) { const d = await idb.get('docs', k); if (d) docs.push(d); }
        return docs;
      },
      async parchear(ruta, p) { const d = aplicarParche(await idb.get('docs', ruta), p); await idb.put('docs', ruta, d); aviso(); return d; },
      async borrar(ruta) { await idb.del('docs', ruta); aviso(); },
      async subirFoto(ruta, blob) { await idb.put('fotos', ruta, blob); aviso(); },
      async leerFoto(ruta) { return (await idb.get('fotos', ruta)) || null; },
      async borrarFoto(ruta) { await idb.del('fotos', ruta); },
      async sincronizar() { return false; },
      hayPendientes: async () => false
    };
  }

  // ---------- Modo SharePoint (Microsoft Graph) ----------
  function StoreSharePoint(sp) {
    const GRAPH = 'https://graph.microsoft.com/v1.0';
    let estado = () => {};
    let token = null, caduca = 0, driveId = null;
    let enviando = false;

    async function obtenerToken() {
      if (token && caduca - Date.now() > 5 * 60 * 1000) return token;
      const r = await fetch(sp.tokenEndpoint);
      if (!r.ok) throw new Error('Token HTTP ' + r.status);
      const j = await r.json();
      if (!j.access_token) throw new Error('Respuesta de token sin access_token');
      token = j.access_token;
      caduca = Date.now() + (Number(j.expires_in) || 3600) * 1000;
      return token;
    }

    async function graph(ruta, opciones) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 20000);
      try {
        const tk = await obtenerToken();
        const o = Object.assign({}, opciones || {}, { signal: ctrl.signal });
        o.headers = Object.assign({ Authorization: 'Bearer ' + tk }, (opciones && opciones.headers) || {});
        return await fetch(GRAPH + ruta, o);
      } finally { clearTimeout(t); }
    }

    async function prepararDrive() {
      if (driveId) return driveId;
      const guardado = await idb.get('meta', 'driveId');
      try {
        const site = await (await graph('/sites/' + sp.siteHost + ':' + sp.sitePath)).json();
        const drives = await (await graph('/sites/' + site.id + '/drives')).json();
        driveId = drives.value && drives.value[0] && drives.value[0].id;
        if (!driveId) throw new Error('Sin biblioteca de documentos');
        await idb.put('meta', 'driveId', driveId);
      } catch (e) {
        if (guardado) driveId = guardado; else throw e;
      }
      return driveId;
    }

    const rutaArchivo = ruta => '/drives/' + driveId + '/root:/' + sp.carpeta + '/' + ruta.split('/').map(encodeURIComponent).join('/');

    async function leerRemoto(ruta) {
      const r = await graph(rutaArchivo(ruta) + ':/content');
      if (r.status === 404) return null;
      if (!r.ok) throw new Error('Lectura HTTP ' + r.status);
      return r.json();
    }

    async function escribirRemoto(ruta, cuerpo, tipo) {
      const r = await graph(rutaArchivo(ruta) + ':/content', {
        method: 'PUT', headers: { 'Content-Type': tipo || 'application/json' },
        body: tipo ? cuerpo : JSON.stringify(cuerpo)
      });
      if (!r.ok) throw new Error('Escritura HTTP ' + r.status);
      return r.json().catch(() => null);
    }

    async function borrarRemoto(ruta) {
      const r = await graph(rutaArchivo(ruta), { method: 'DELETE' });
      if (!r.ok && r.status !== 404) throw new Error('Borrado HTTP ' + r.status);
    }

    // Cola de cambios pendientes, en orden
    async function encolar(cambio) { await idb.put('cola', claveCola(), cambio); enviarCola(); }

    async function enviarCola() {
      if (enviando) return;
      enviando = true;
      try {
        const claves = (await idb.keys('cola')).sort();
        if (!claves.length) { estado({ tipo: 'ok', texto: 'SharePoint: sincronizado' }); return; }
        estado({ tipo: 'info', texto: 'Guardando en SharePoint…' });
        await prepararDrive();
        for (const k of claves) {
          const c = await idb.get('cola', k);
          if (c) {
            if (c.tipo === 'parche') {
              // Leer lo último del servidor y aplicar solo nuestro cambio: no pisamos lo del otro usuario
              const remoto = await leerRemoto(c.ruta);
              const nuevo = aplicarParche(remoto, c.parche);
              const info = await escribirRemoto(c.ruta, nuevo);
              await idb.put('docs', c.ruta, nuevo);
              if (info && info.eTag) await idb.put('meta', 'etag:' + c.ruta, info.eTag);
            } else if (c.tipo === 'borrar') {
              await borrarRemoto(c.ruta);
            } else if (c.tipo === 'foto') {
              const blob = await idb.get('fotos', c.ruta);
              if (blob) await escribirRemoto(c.ruta, blob, blob.type || 'image/jpeg');
            }
          }
          await idb.del('cola', k);
        }
        estado({ tipo: 'ok', texto: 'SharePoint: sincronizado' });
      } catch (e) {
        estado({ tipo: 'aviso', texto: 'Sin conexión · se enviará al volver la cobertura' });
      } finally { enviando = false; }
    }

    window.addEventListener('online', enviarCola);
    setInterval(enviarCola, 30000);

    // Descarga solo los documentos que han cambiado (por eTag)
    async function sincronizarCarpeta(prefijo) {
      const carpeta = sp.carpeta + (prefijo ? '/' + prefijo.replace(/\/$/, '') : '');
      const r = await graph('/drives/' + driveId + '/root:/' + carpeta.split('/').map(encodeURIComponent).join('/') + ':/children?$select=name,eTag,file&$top=999');
      if (r.status === 404) return new Set();
      if (!r.ok) throw new Error('Listado HTTP ' + r.status);
      const items = ((await r.json()).value || []).filter(i => i.file && /\.json$/i.test(i.name));
      const presentes = new Set();
      for (const it of items) {
        const ruta = (prefijo || '') + it.name;
        presentes.add(ruta);
        if ((await idb.get('meta', 'etag:' + ruta)) !== it.eTag) {
          const doc = await leerRemoto(ruta);
          if (doc) { await idb.put('docs', ruta, doc); await idb.put('meta', 'etag:' + ruta, it.eTag); }
        }
      }
      return presentes;
    }

    return {
      modo: 'sharepoint',
      onEstado(fn) { estado = fn; },
      async iniciar() {
        estado({ tipo: 'info', texto: 'Conectando con SharePoint…' });
        try { await prepararDrive(); await this.sincronizar(); }
        catch (e) { estado({ tipo: 'aviso', texto: 'Sin conexión · mostrando la última copia' }); }
      },
      async sincronizar() {
        if (await this.hayPendientes()) { await enviarCola(); if (await this.hayPendientes()) return false; }
        try {
          await prepararDrive();
          await sincronizarCarpeta('');
          const enServidor = await sincronizarCarpeta('empresas/');
          // Quitar del móvil las empresas que el otro usuario eliminó
          for (const k of await idb.keys('docs')) {
            if (String(k).startsWith('empresas/') && !enServidor.has(k)) { await idb.del('docs', k); await idb.del('meta', 'etag:' + k); }
          }
          estado({ tipo: 'ok', texto: 'SharePoint: sincronizado' });
          return true;
        } catch (e) {
          estado({ tipo: 'aviso', texto: 'Sin conexión · mostrando la última copia' });
          return false;
        }
      },
      async leer(ruta) { return (await idb.get('docs', ruta)) || null; },
      async listar(prefijo) {
        const claves = (await idb.keys('docs')).filter(k => String(k).startsWith(prefijo));
        const docs = [];
        for (const k of claves) { const d = await idb.get('docs', k); if (d) docs.push(d); }
        return docs;
      },
      async parchear(ruta, p) {
        const d = aplicarParche(await idb.get('docs', ruta), p);
        await idb.put('docs', ruta, d);
        await encolar({ tipo: 'parche', ruta, parche: p });
        return d;
      },
      async borrar(ruta) { await idb.del('docs', ruta); await encolar({ tipo: 'borrar', ruta }); },
      async subirFoto(ruta, blob) { await idb.put('fotos', ruta, blob); await encolar({ tipo: 'foto', ruta }); },
      async leerFoto(ruta) {
        const local = await idb.get('fotos', ruta);
        if (local) return local;
        try {
          await prepararDrive();
          const r = await graph(rutaArchivo(ruta) + ':/content');
          if (!r.ok) return null;
          const blob = await r.blob();
          await idb.put('fotos', ruta, blob);
          return blob;
        } catch (e) { return null; }
      },
      async borrarFoto(ruta) { await idb.del('fotos', ruta); await encolar({ tipo: 'borrar', ruta }); },
      hayPendientes: async () => (await idb.keys('cola')).length > 0
    };
  }

  window.crearStore = function (cfg) {
    return (cfg.SHAREPOINT && cfg.SHAREPOINT.activo) ? StoreSharePoint(cfg.SHAREPOINT) : StoreMovil();
  };
  window.aplicarParche = aplicarParche;
})();
