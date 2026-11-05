/* Configuración · Automechanika Shanghai 26 · Lizarte */
'use strict';

window.APP_CONFIG = {
  VERSION: '1.0.0',
  EVENTO: 'Automechanika Shanghai 2026',
  FECHAS_FERIA: { inicio: '2026-12-02', fin: '2026-12-05', lugar: 'NECC · Shanghái' },
  USUARIOS: ['Krum', 'Scrum'],

  // Conexión con el SharePoint de Lizarte (misma vía que la app Misión China 2026).
  // Con activo: false, todo se guarda solo en el propio móvil.
  SHAREPOINT: {
    activo: false,
    tokenEndpoint: 'https://lizarte-pwa-token-ewfxatfpabg2btaq.westeurope-01.azurewebsites.net/api/getToken',
    siteHost: 'lizarte.sharepoint.com',
    sitePath: '/sites/MisionesComercialesICEX',
    carpeta: 'Automechanika-Shanghai-2026'
  }
};
