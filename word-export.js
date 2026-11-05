/* Informe Word · Automechanika Shanghai 26 · Lizarte
 * Formato Lizarte: logo, títulos Georgia magenta, texto Arial gris, bloques en tonos pastel.
 * Se carga solo al exportar (junto con vendor/docx.min.js). */
(function () {
  'use strict';

  const MAGENTA = 'D1007A';
  const GRIS = '595959';
  const GRIS_SUAVE = '8C8C8C';
  const LINEA = 'E6DCF2';
  const PASTEL = { u0: 'EAF3FC', u1: 'F2ECFC', prep: 'FFF7E3', info: 'F7F4FB', cab: 'FCE4F1' };
  const ANCHO = 9638; // A4 con márgenes de 2 cm, en DXA
  const CRITERIOS = { A: 'cremalleras / cajas hidráulicas', B: 'EPS', C: 'refabrica recambios' };

  function fechaLarga(iso) {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    return isNaN(d) ? iso : d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
  const dos = n => String(n).padStart(2, '0');
  const fechaCorta = iso => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + '/' + m[2] + '/' + m[1] : (iso || ''); };
  const hoyTxt = () => { const h = new Date(); return dos(h.getDate()) + '-' + dos(h.getMonth() + 1) + '-' + h.getFullYear(); };

  async function dimensiones(blob) {
    try {
      if (window.createImageBitmap) { const b = await createImageBitmap(blob); const r = { w: b.width, h: b.height }; b.close && b.close(); return r; }
    } catch (e) { /* seguimos con Image */ }
    return new Promise(res => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => { res({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(url); };
      img.onerror = () => { res({ w: 4, h: 3 }); URL.revokeObjectURL(url); };
      img.src = url;
    });
  }
  const tipoImagen = blob => /png/i.test(blob.type) ? 'png' : (/gif/i.test(blob.type) ? 'gif' : 'jpg');

  window.generarInformeWord = async function (o) {
    const D = window.docx;
    const { Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType, ShadingType,
      BorderStyle, AlignmentType, HeadingLevel, Header, Footer, PageNumber, PageBreak, TableLayoutType } = D;
    const { CFG, usuario, viaje, feria, visitas, incluirFotos, leerFoto, progreso } = o;
    const U = CFG.USUARIOS;
    const colorU = u => PASTEL['u' + Math.max(0, U.indexOf(u))];

    // ---------- Piezas básicas ----------
    const run = (texto, extra) => new TextRun(Object.assign({ text: String(texto == null ? '' : texto) }, extra || {}));
    const parrafos = (texto, extra, pextra) => String(texto || '').split(/\r?\n/).map(l =>
      new Paragraph(Object.assign({ children: [run(l, extra)], spacing: { after: 60 } }, pextra || {})));
    const vacio = (n) => new Paragraph({ children: [], spacing: { after: n || 120 } });
    const sinBordes = { top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } };
    const bordesSuaves = { top: { style: BorderStyle.SINGLE, size: 4, color: LINEA }, bottom: { style: BorderStyle.SINGLE, size: 4, color: LINEA },
      left: { style: BorderStyle.SINGLE, size: 4, color: LINEA }, right: { style: BorderStyle.SINGLE, size: 4, color: LINEA } };
    const margenCelda = { top: 100, bottom: 100, left: 140, right: 140 };

    function celda(children, ancho, fill, extra) {
      return new TableCell(Object.assign({
        width: { size: ancho, type: WidthType.DXA }, margins: margenCelda, borders: bordesSuaves,
        shading: fill ? { type: ShadingType.CLEAR, color: 'auto', fill } : undefined, children
      }, extra || {}));
    }

    // Recuadro de color a lo ancho (notas, preparación)
    function recuadro(titulo, cuerpo, fill) {
      return new Table({
        width: { size: ANCHO, type: WidthType.DXA }, columnWidths: [ANCHO], layout: TableLayoutType.FIXED,
        rows: [new TableRow({ cantSplit: true, children: [celda([
          new Paragraph({ children: [run(titulo, { bold: true, color: '3D3550' })], spacing: { after: 80 } }),
          ...cuerpo
        ], ANCHO, fill, { borders: sinBordes })] })]
      });
    }

    // Tabla de dos columnas etiqueta / valor
    function tablaDatos(filas) {
      const c1 = 2300, c2 = ANCHO - c1;
      const validas = filas.filter(([, v]) => v != null && String(v).trim() !== '' && v !== '—');
      if (!validas.length) return null;
      return new Table({
        width: { size: ANCHO, type: WidthType.DXA }, columnWidths: [c1, c2], layout: TableLayoutType.FIXED,
        rows: validas.map(([k, v]) => new TableRow({ children: [
          celda([new Paragraph({ children: [run(k, { bold: true, color: MAGENTA, size: 18 })] })], c1, PASTEL.info),
          celda(parrafos(v, { size: 19 }, { spacing: { after: 0 } }), c2)
        ] }))
      });
    }

    function tablaListado(cabeceras, anchos, filas) {
      return new Table({
        width: { size: ANCHO, type: WidthType.DXA }, columnWidths: anchos, layout: TableLayoutType.FIXED,
        rows: [
          new TableRow({ tableHeader: true, children: cabeceras.map((h, i) =>
            celda([new Paragraph({ children: [run(h, { bold: true, color: MAGENTA, size: 18 })] })], anchos[i], PASTEL.cab)) }),
          ...filas.map(f => new TableRow({ children: f.map((v, i) =>
            celda([new Paragraph({ children: [run(v, { size: 19 })] })], anchos[i])) }))
        ]
      });
    }

    async function bloqueFotos(rutas) {
      const imgs = [];
      for (const r of rutas) {
        const blob = await leerFoto(r);
        if (!blob) continue;
        const d = await dimensiones(blob);
        const max = 290, k = Math.min(max / d.w, 260 / d.h, 1.5);
        imgs.push(new ImageRun({ type: tipoImagen(blob), data: await blob.arrayBuffer(),
          transformation: { width: Math.round(d.w * k), height: Math.round(d.h * k) } }));
      }
      if (!imgs.length) return [];
      const col = ANCHO / 2;
      const filas = [];
      for (let i = 0; i < imgs.length; i += 2) {
        filas.push(new TableRow({ cantSplit: true, children: [0, 1].map(j => celda(
          [new Paragraph({ alignment: AlignmentType.CENTER, children: imgs[i + j] ? [imgs[i + j]] : [] })], col, null, { borders: sinBordes })) }));
      }
      return [new Table({ width: { size: ANCHO, type: WidthType.DXA }, columnWidths: [col, col], layout: TableLayoutType.FIXED, rows: filas })];
    }

    async function notasUsuarios(doc, campo) {
      const out = [];
      for (const u of U) {
        const b = (doc.usuarios || {})[u] || {};
        const texto = String(b[campo] || '').trim();
        const fotos = campo === 'texto' && incluirFotos ? (b.fotos || []).map(f => f.ruta) : [];
        if (!texto && !fotos.length) continue;
        const cuerpo = texto ? parrafos(texto, { size: 20 }) : [new Paragraph({ children: [run('Sin notas escritas.', { italics: true, color: GRIS_SUAVE })] })];
        out.push(recuadro('Notas de ' + u, cuerpo, colorU(u)));
        if (fotos.length) out.push(vacio(60), ...(await bloqueFotos(fotos)));
        out.push(vacio(100));
      }
      return out;
    }

    // ---------- Logo ----------
    let logo = null;
    try { logo = await (await fetch('lizarte-logo.png')).arrayBuffer(); } catch (e) { /* sin logo */ }
    const logoRun = (w) => logo ? new ImageRun({ type: 'png', data: logo, transformation: { width: w, height: Math.round(w * 96 / 335) } }) : run('LIZARTE', { bold: true, color: MAGENTA });

    // ---------- Portada ----------
    const ff = feria, vv = visitas;
    const cuenta = (lista, f) => lista.filter(f).length;
    const nFotos = [...ff, ...vv].reduce((n, e) => n + U.reduce((m, u) => m + (((e.usuarios || {})[u] || {}).fotos || []).length, 0), 0);
    const portada = [
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 1800, after: 600 }, children: [logoRun(260)] }),
      new Paragraph({ heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, children: [run(CFG.TITULO || 'Viaje China')] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [run(CFG.EVENTO + ' · 2 al 5 de diciembre de 2026', { size: 26, color: GRIS })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 900 }, children: [run('Informe de feria y visitas a empresas', { size: 24, color: GRIS_SUAVE })] }),
      tablaListado(['Empresas en la feria', 'Importantes', 'Visitadas', 'Visitas a empresas', 'Fotos'],
        [1928, 1927, 1927, 1928, 1928],
        [[String(ff.length), String(cuenta(ff, e => e.categoria !== 'secundario')), String(cuenta([...ff, ...vv], e => e.visitado)), String(vv.length), String(nFotos)]]),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 600 }, children: [run('Generado el ' + hoyTxt() + ' por ' + usuario + ' desde la app', { size: 18, color: GRIS_SUAVE })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [run('Equipo: ' + U.join(' y '), { size: 18, color: GRIS_SUAVE })] })
    ];

    // ---------- Organización del viaje ----------
    const viajeSec = [new Paragraph({ children: [new PageBreak()] }), new Paragraph({ heading: HeadingLevel.HEADING_1, children: [run('Organización del viaje')] })];
    const vuelos = [...(viaje.vuelos || [])].sort((a, b) => String((a.fecha || '') + (a.hora || '')).localeCompare((b.fecha || '') + (b.hora || '')));
    viajeSec.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [run('Vuelos')] }));
    viajeSec.push(vuelos.length ? tablaListado(['Fecha', 'Hora', 'Desde', 'Hasta', 'Vuelo'], [1500, 1000, 2900, 2900, 1338],
      vuelos.map(v => [fechaCorta(v.fecha), v.hora || '', v.origen || '', v.destino || '', v.numero || ''])) : new Paragraph({ children: [run('Sin vuelos registrados.', { italics: true, color: GRIS_SUAVE })] }));
    viajeSec.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [run('Hoteles')] }));
    const hoteles = [...(viaje.hoteles || [])].sort((a, b) => String(a.entrada || '').localeCompare(b.entrada || ''));
    viajeSec.push(hoteles.length ? tablaListado(['Hotel', 'Ciudad', 'Entrada', 'Salida', 'Dirección'], [2300, 1300, 1700, 1700, 2638],
      hoteles.map(h => [h.nombre || '', h.ciudad || '', fechaCorta(h.entrada), fechaCorta(h.salida), h.direccion || ''])) : new Paragraph({ children: [run('Sin hoteles registrados.', { italics: true, color: GRIS_SUAVE })] }));
    const nViaje = await notasUsuarios(viaje, 'notasViaje');
    const nRuta = await notasUsuarios(viaje, 'notasRuta');
    if (nViaje.length) viajeSec.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [run('Notas del viaje')] }), ...nViaje);
    if (nRuta.length) viajeSec.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [run('Notas de la ruta')] }), ...nRuta);

    // ---------- Fichas de empresa ----------
    async function ficha(e, i, total, esFeria) {
      progreso && progreso(i, total, e.nombre);
      const p = e.prep || {};
      const titulo = (esFeria && e.orden ? e.orden + '. ' : '') + (e.nombre || 'Empresa');
      const out = [new Paragraph({ heading: HeadingLevel.HEADING_2, children: [run(titulo)] })];
      if (e.nombreZh) out.push(new Paragraph({ spacing: { after: 100 }, children: [run(e.nombreZh, { size: 22, color: GRIS, font: { eastAsia: 'Microsoft YaHei' } })] }));
      const estado = [esFeria ? (e.categoria === 'secundario' ? 'Menos importante' : 'Importante') : 'Visita', e.visitado ? 'Visitada' : 'Pendiente de visitar'].join(' · ');
      const datos = tablaDatos([
        esFeria ? ['Pabellón / stand', (e.pabellon ? 'Pabellón ' + e.pabellon : 'Sin pabellón') + (e.stand ? ' · Stand ' + e.stand : '')] : ['Cuándo', [fechaLarga(e.fecha), e.hora].filter(Boolean).join(' · ')],
        ['Estado', estado],
        ['Ubicación', [e.direccion, e.ciudad, e.pais].filter(Boolean).join(', ')],
        ['Contacto', [e.contacto, e.rol].filter(Boolean).join(' · ')],
        ['Email', e.email], ['Teléfono', e.telefono], ['Web / WeChat', e.web]
      ]);
      if (datos) out.push(datos, vacio(80));
      const crit = (p.criterio || '').replace(/\b([ABC])\b/g, (m, l) => l + ' (' + CRITERIOS[l] + ')');
      const prepFilas = [['Criterio', crit], ['Evidencia', p.evidencia], ['Aparece en', p.apareceEn], ['Prioridad ruta Óscar', p.prioridadOscar], ['Observaciones', p.observaciones]]
        .filter(([, v]) => v && v !== '—');
      if (prepFilas.length) {
        out.push(recuadro('Preparación (ficheros KKK y OH)', prepFilas.map(([k, v]) =>
          new Paragraph({ spacing: { after: 60 }, children: [run(k + ': ', { bold: true, color: '8A6A1F', size: 19 }), run(v, { size: 19 })] })), PASTEL.prep), vacio(100));
      }
      const notas = await notasUsuarios(e, 'texto');
      if (notas.length) out.push(...notas);
      else out.push(new Paragraph({ spacing: { after: 160 }, children: [run('Sin notas ni fotos.', { italics: true, color: GRIS_SUAVE, size: 19 })] }));
      out.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: LINEA, space: 4 } }, spacing: { after: 240 }, children: [] }));
      return out;
    }

    const total = ff.length + vv.length;
    let n = 0;
    const feriaSec = [];
    if (ff.length) {
      feriaSec.push(new Paragraph({ children: [new PageBreak()] }), new Paragraph({ heading: HeadingLevel.HEADING_1, children: [run('Automechanika Shanghai')] }),
        new Paragraph({ spacing: { after: 200 }, children: [run('Empresas en el orden de la ruta por pabellones.', { color: GRIS_SUAVE, size: 19 })] }));
      let pab = null;
      for (const e of ff) {
        const g = e.pabellon ? 'Pabellón ' + e.pabellon : 'Sin pabellón asignado';
        if (g !== pab) { pab = g; feriaSec.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: [run(g.toUpperCase())] })); }
        feriaSec.push(...(await ficha(e, ++n, total, true)));
      }
    }
    const visitasSec = [];
    if (vv.length) {
      visitasSec.push(new Paragraph({ children: [new PageBreak()] }), new Paragraph({ heading: HeadingLevel.HEADING_1, children: [run('Visitas a empresas')] }));
      for (const e of vv) visitasSec.push(...(await ficha(e, ++n, total, false)));
    }

    // ---------- Documento ----------
    const doc = new Document({
      creator: usuario + ' · Lizarte',
      title: (CFG.TITULO || '') + ' · ' + CFG.EVENTO,
      styles: {
        default: {
          document: { run: { font: 'Arial', size: 20, color: GRIS } },
          title: { run: { font: 'Georgia', size: 56, color: MAGENTA }, paragraph: { spacing: { before: 0, after: 200 }, keepNext: true } },
          heading1: { run: { font: 'Georgia', size: 36, color: MAGENTA }, paragraph: { spacing: { before: 0, after: 240 }, keepNext: true } },
          heading2: { run: { font: 'Georgia', size: 28, color: MAGENTA }, paragraph: { spacing: { before: 280, after: 80 }, keepNext: true } },
          heading3: { run: { font: 'Arial', size: 18, bold: true, color: GRIS_SUAVE }, paragraph: { spacing: { before: 320, after: 120 }, keepNext: true } }
        }
      },
      sections: [{
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1300, bottom: 1134, left: 1134, right: 1134, header: 500, footer: 500 } }, titlePage: true },
        headers: {
          default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [logoRun(90)] })] }),
          first: new Header({ children: [new Paragraph({ children: [] })] })
        },
        footers: {
          default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
            run((CFG.TITULO || '') + ' · ' + CFG.EVENTO + ' · página ', { size: 16, color: GRIS_SUAVE }),
            new TextRun({ children: [PageNumber.CURRENT], size: 16, color: GRIS_SUAVE })] })] }),
          first: new Footer({ children: [new Paragraph({ children: [] })] })
        },
        children: [...portada, ...viajeSec, ...feriaSec, ...visitasSec]
      }]
    });
    const blob = await Packer.toBlob(doc);
    const pref = usuario === 'Krum' ? 'KKK_' : (/^[OÓ]scar$/i.test(usuario) ? 'OH_' : '');
    return { blob, nombre: pref + 'Informe Automechanika Shanghai 2026 ' + hoyTxt() + '.docx' };
  };
})();
