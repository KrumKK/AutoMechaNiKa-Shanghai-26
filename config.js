/* Configuración · Automechanika Shanghai 26 · Lizarte */
'use strict';

window.APP_CONFIG = {
  VERSION: '1.1.0',
  TITULO: '2º Viaje China',
  EVENTO: 'Automechanika Shanghai 2026',
  FECHAS_FERIA: { inicio: '2026-12-02', fin: '2026-12-05', lugar: 'NECC · Shanghái' },
  USUARIOS: ['Krum', 'Óscar'],

  // Orden de recorrido de los pabellones (ruta de Óscar). Los no listados van al final.
  ORDEN_PABELLONES: ['5.1', '6.1', '7.1', '7.2', '8.1', '1.1', '1.2', '2.1', '3', '4.1'],

  // Datos guardados en la carpeta "APP VIAJE CHINA" del OneDrive de Óscar Huarte:
  // Año 2026 / Innovación / Post viaje / 04.Mr. Xie CPRA (CAAM) / Preparación viaje octubre 2026 /
  // 02.AutoMechaniKa Shanghai / APP VIAJE CHINA
  // (en el PC de Krum: OneDrive - LIZARTE,S.A \ Archivos de Oscar Huarte - Post viaje \ …)
  // Con activo: false, todo se guarda solo en el propio dispositivo.
  SHAREPOINT: {
    activo: true,
    tokenEndpoint: 'https://lizarte-pwa-token-ewfxatfpabg2btaq.westeurope-01.azurewebsites.net/api/getToken',
    driveId: 'b!IvJ0KCgYOUi5XnKe9Z7yeNRZyGyvRptKtA6ygd2UCP1ymrXc_5m7Trt0ph59xhcc',
    carpetaId: '01ZHQLNDSBW5MMT6P4SBFZ66YKTLJHR4IC'
  }
};
