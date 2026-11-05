# Conexión con el servidor de Lizarte (SharePoint)

## Cómo funciona

La app usa la misma vía que Misión China 2026:

1. Pide un token de Microsoft Graph a la Azure Function `lizarte-pwa-token…/api/getToken`.
2. Lee y escribe archivos en el sitio `lizarte.sharepoint.com/sites/MisionesComercialesICEX`, biblioteca por defecto.
3. Todo va dentro de la carpeta `Automechanika-Shanghai-2026` (Graph la crea sola al guardar el primer archivo).

```
Automechanika-Shanghai-2026/
├── viaje.json                 vuelos, hoteles y notas generales de cada usuario
├── empresas/<id>.json         una ficha por empresa (feria o visita)
└── fotos/<id>/<usuario>-….jpg fotos de cada ficha (JPEG reducido a 1600 px)
```

Cada JSON tiene campos compartidos y un bloque por usuario:

```json
{
  "id": "…", "tipo": "feria", "nombre": "…", "pabellon": "5.1", "stand": "A23",
  "categoria": "importante", "visitado": false,
  "usuarios": {
    "Krum":  { "texto": "…", "fotos": [{ "ruta": "fotos/…/Krum-….jpg", "fecha": "…" }] },
    "Scrum": { "texto": "…", "fotos": [] }
  }
}
```

Al guardar, la app vuelve a leer el archivo del servidor y cambia solo su parte, para no pisar lo que haya escrito el otro usuario. Sin cobertura, los cambios quedan en el móvil y se envían al volver la conexión.

## Para activarlo

En `config.js`, poner `SHAREPOINT.activo: true`. La Azure Function debe aceptar peticiones (CORS) desde `https://krumkk.github.io`, igual que ya hace con Misión China 2026.

## Puntos a revisar con sistemas

* El endpoint del token responde a cualquiera que lo llame, y su dirección está en el código público de GitHub. Quien lo conozca obtiene un token con los permisos que tenga la aplicación en Azure. Conviene limitarlo: permisos solo sobre el sitio `MisionesComercialesICEX` (Sites.Selected), CORS restringido y, idealmente, una clave o inicio de sesión de Microsoft.
* Las contraseñas de la app protegen la pantalla del móvil, no los datos del servidor. La protección real de los datos es la del punto anterior.
